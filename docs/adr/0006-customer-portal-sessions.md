# ADR 0006: Customer portal sessions scoped to one business, and joining by email link

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Each business has a customer portal at `/c/:tenantSlug`, backed by `/api/v1/portal/:tenantSlug/...`.
Customers are rows of one tenant (`Customer` is unique on `tenantId, email`), so the same
person can be a customer of two businesses with two unrelated accounts.

Two things make the portal different from the merchant side (ADR 0002):

1. **The tenant is in the URL, not in a membership.** There is no membership row to check. The
   slug is public, since it is the address the business gives its customers.
2. **Most customers already exist before they ever sign in.** Staff enrol them at the till with
   just a name and email, and points pile up on that record. The first time the customer
   "registers", someone has to decide whether the person typing that email may take over an
   account that already holds points.

## Decision

**A customer session only works at the business it was issued for, checked in two places.**

- The customer access token (`aud: customer`) carries a `tid` claim with the tenant id. The
  portal guard resolves the slug to a tenant and rejects a token whose `tid` differs (401).
- The cookies (`ph_portal_access`, `ph_portal_refresh`) are path-scoped to
  `/api/v1/portal/<slug>` (refresh: `.../<slug>/auth`), so the browser never sends one
  business's session to another business's portal. This also lets one browser hold sessions for
  several portals, and a merchant session alongside them.

A refresh token presented at the wrong business is rejected after it is consumed, which ends that
session. That only happens to a client that is misbehaving already.

**Every portal query runs in the tenant scope** set from the slug, through the same tenant-scoped
Prisma client and services as the dashboard (ADR 0001). The customer id only ever comes from the
session, never from the request.

**Joining answers every address the same way, and only the owner of an address can finish.**
`POST /auth/register` takes a name and an email (no password) and always returns 202 with no
body. It never signs anyone in. What it does depends on the address, but the response, cookies
and work done are the same either way:

- _new address_: emails a **join link**. The customer is created (with `customer.created` in the
  outbox) only when the link is used.
- _known address_ (enrolled at the till, or joined before): emails a **set-password link** for
  that customer. This is how in-store customers claim their account and its points.

Both links open the same "choose your password" page. `POST /auth/set-password` sets the
password and signs the customer in, since following the link proves they own the address. Both
are JWTs (`aud: customer-password`) naming the business, so they only work in its portal, and
both work once:

- a join link names the address and the name given. It fails once that address is a customer,
  whether the link was used already or staff enrolled them meanwhile.
- a set-password link names the customer and a fingerprint of their current password hash (or of
  no password). It fails once the password changes, and the update is conditional on the old
  hash, so two uses cannot both succeed. Setting a password revokes the customer's other sessions.

The set-password link also serves "forgot password", which likewise answers every address the
same way.

**Rate limits follow what is being protected.** Login: 5 per minute per business, IP and email.
Join and reset emails: 5 per 15 minutes per business and email address. That stops
someone flooding one person's inbox, without a per-IP limit that would block a queue of customers
signing up on the shop's wifi.

## Alternatives considered

- **Sign in on register whenever the email has no password yet.** Simplest, and it would let
  anyone who knows a regular's email spend their points. Rejected.
- **Staff invite customers to the portal.** That adds work at the till, and customers who join
  online would still need the same email proof.
- **Sign new addresses in straight away, and email only known ones.** Saves new members a trip
  to their inbox, but the status code (and the slower password hash on one path) would tell
  anyone whether an address is already a customer. It would also never check that a new member
  owns the address they typed. Rejected in favour of the uniform answer.
- **One cookie for all portals with the tenant id in the token only.** Secure because of `tid`,
  but the browser would send every portal session to every portal, and signing in to a second
  business would overwrite the first.

## Consequences

- The portal isolation suite proves a session, refresh token, join link and password link from
  one business are rejected at another, and that another business's reward ids cannot be
  redeemed. Its coverage check fails if a portal route is added without a probe.
- The web client keys session renewal by scope (`/auth/refresh` or `/portal/<slug>/auth/refresh`),
  so a 401 in the portal never touches the merchant session, and vice versa.
- Neither joining nor forgot-password reveals whether an address is a customer. The cost is that
  every new member confirms their email before first use; the demo customer already has a
  password, so the 30-second demo is unaffected.
