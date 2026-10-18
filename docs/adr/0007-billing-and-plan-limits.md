# ADR 0007: Stripe webhooks as the source of truth for plans, and plan limits under a lock

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Businesses start on the Free plan (up to 100 customers) and can upgrade
to Pro with a Stripe subscription. Stripe owns the subscription; PointsHub only needs to know
which plan each business is entitled to, and to enforce that plan's limits.

Three properties of Stripe shape the design:

1. **Checkout returns the browser before Stripe has confirmed anything.** A user can also
   close the tab after paying, so the success redirect cannot be what upgrades a business.
2. **Webhooks are delivered at least once and in no guaranteed order.** The same event can
   arrive twice, two at once, or a `customer.subscription.updated` can land after the
   `customer.subscription.deleted` that followed it.
3. **The webhook endpoint is public.** Only the `Stripe-Signature` header, an HMAC over the
   exact request bytes, distinguishes Stripe from anyone else.

## Decision

**Only verified webhooks change a business's plan.** `POST /billing/checkout` creates (once
per business) a Stripe customer and a Checkout session, and returns its URL. The success page
polls `GET /billing` until the plan reads Pro; it never upgrades anything itself.

**The signature is checked against the raw body.** The API keeps `req.rawBody` alongside the
parsed JSON and verifies it with the Stripe SDK (`constructEvent`, five-minute tolerance)
before reading the event. The route opts out of the session and CSRF guards, because Stripe
has neither, and nothing else.

**Each event is applied exactly once, in one transaction:**

1. Insert the event id into `StripeWebhookEvent` with `ON CONFLICT DO NOTHING`. A concurrent
   delivery of the same event blocks on the unique index until the first commits, then inserts
   nothing and returns `{ duplicate: true }`.
2. Lock the tenant row (`SELECT ... FOR UPDATE`), found by `client_reference_id` for Checkout
   or by Stripe customer id for subscription and invoice events.
3. **Re-read the subscription from Stripe** and mirror its current status, period end and
   cancellation flag onto the tenant; audit any change of plan or status.

If any step fails, everything rolls back, the endpoint answers 5xx, and Stripe retries later.

Re-reading the subscription, rather than trusting the payload, is what makes ordering
irrelevant: whichever event is processed last writes the state Stripe has _now_, and the
tenant lock means two events for one business cannot interleave their read and write. The
cost is one Stripe API call per event, made while a single tenant row is locked, which is
acceptable at webhook volumes.

**Status maps to plan in one place** (`planForSubscription` in `packages/shared`): `active`,
`trialing` and `past_due` are Pro; anything else is Free. `past_due` stays Pro on purpose:
Stripe is still retrying the card, and the owner gets an email with a link to the billing
page. When Stripe gives up, the status becomes `canceled` or `unpaid` and the business drops to
Free. Existing customers and data are kept; only new enrolments are blocked.

**The customer limit is enforced inside the transaction that creates the customer.**
`CustomersService.create` serves the dashboard, inline enrolment while recording a purchase,
and portal sign-ups, so the check lives there. It locks the tenant row, then counts customers:
a plain count-then-insert would let concurrent enrolments at 99 customers all pass. Exceeding
the limit is a 402 Problem Details response (`/problems/plan-limit`); the dashboard turns it into
an upgrade prompt for the owner. A customer joining through the portal gets "not taking new
members online, please ask in store" instead, since upgrading is not their concern, and their
join link stays valid for when there is room.

**Billing is optional per installation.** Without the three `STRIPE_*` variables the gateway
is absent: `GET /billing` reports `billingAvailable: false`, checkout, portal and the webhook
answer 503, and seeded plans stay as they are. Only test-mode keys (`sk_test_`/`rk_test_`) are
accepted, so a live key cannot be configured by mistake.

## Alternatives considered

- **Upgrade on the Checkout success redirect** (or by retrieving the session there). Simple,
  but it misses users who close the tab, and it needs the webhook anyway for renewals,
  failures and cancellations, which would make two code paths write the same state.
- **Apply the event payload directly and compare `event.created` timestamps** to discard stale
  events. This needs a stored "last applied" timestamp per tenant, and `created` has
  one-second resolution, so two events in the same second still race. Re-reading is simpler
  and always correct.
- **Process webhooks asynchronously through the outbox and worker.** It would decouple Stripe's
  latency from the response, but Stripe already retries, the work is one API call and one
  update, and an extra hop would delay the upgrade the owner is waiting for on the success page.
- **Count customers with a unique "seat" table or a cached counter on the tenant.** A counter
  must be kept in sync on every create and delete. Locking the tenant row only serialises
  enrolments within one business, which happen at human speed.

## Consequences

- A business is never upgraded without a verified Stripe confirmation, and a replayed,
  duplicated or reordered event cannot leave it on the wrong plan. Integration tests cover
  duplicates (sequential and concurrent), stale payloads, forged and tampered signatures, a
  Checkout session naming another business, and concurrent enrolments at the limit.
- Tests never call Stripe: the `BillingGateway` interface has an in-memory fake, while webhook
  signatures are still produced and verified by the real SDK.
- Webhook handling depends on Stripe's API being reachable. If it is not, the event fails and
  Stripe retries it, with backoff, for up to three days.
- The seeded Pro business has no Stripe subscription, so its billing page explains that there
  is nothing to manage. Locally, `stripe listen` forwards test events to the API (see README).
