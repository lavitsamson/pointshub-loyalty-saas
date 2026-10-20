# Progress

## 1. Foundation

- [x] pnpm workspaces + Turborepo; 14-day minimum release age enforced by pnpm
- [x] Shared TypeScript (strict, `noUncheckedIndexedAccess`), ESLint, Prettier config
- [x] Husky + lint-staged + commitlint (Conventional Commits)
- [x] docker-compose: Postgres, Redis, RabbitMQ (management UI), Mailpit
- [x] Prisma schema for the full domain model + first migration
- [x] Database guards: append-only ledger trigger, single-owner refresh tokens
- [x] NestJS API skeleton: env validation, pino logging with request ids, Problem Details errors, zod validation pipe, Helmet, CORS, body limits, OpenAPI at `/api/docs`
- [x] Health checks: `/health/live`, `/health/ready` (DB, Redis, RabbitMQ)
- [x] Worker skeleton (NestJS standalone application)
- [x] Next.js skeleton (App Router, Tailwind)
- [x] Tests: unit (Jest), integration (Testcontainers), e2e smoke (Playwright)
- [x] GitHub Actions CI (Node 24 actions; runner pinned to ubuntu-24.04 so image upgrades are deliberate)
- [x] README skeleton, ARCHITECTURE.md, ADR 0001

## 2. Auth & tenancy

- [x] Register / login / refresh / logout / me
- [x] Forgot / reset password (single-use, purpose-bound tokens)
- [x] Refresh token rotation with reuse detection
- [x] Login rate limiting (Redis)
- [x] CSRF custom-header guard
- [x] Memberships, roles guard and permission matrix
- [x] Prisma tenant extension (fails closed without a tenant context)
- [x] Tenant isolation test suite, with a check that every tenant-scoped route is covered
- [x] Invitations (create, list, revoke, accept for new and existing accounts)
- [x] Team management (change role, remove, leave; last owner protected)
- [x] Audit log for admin mutations + list endpoint
- [x] Seed: demo tenants, users, programme, tiers, campaign, rewards
- [x] ADR 0002: authentication and sessions
- [x] Auth pages in the web app (built in milestone 4)

## 3. Core loyalty

- [x] Points rules in `packages/shared`: exact earning maths, tier selection, FIFO expiry
- [x] Programme settings, tiers and campaigns (CRUD, audited)
- [x] Customers: search, tier/tag filters, three sort orders with keyset pagination, CRUD
- [x] Bulk actions (adjust points, add/remove tag; up to 500, all or nothing)
- [x] Streaming CSV export with formula-injection protection
- [x] Purchases with Idempotency-Key (replay, race and key-reuse handling)
- [x] Ledger service: row lock, non-negative balance, cached balance and tier, outbox events
- [x] Adjustments with reason (audited)
- [x] Rewards and redemptions: stock, counter codes, fulfil, cancel with REVERSAL
- [x] Tests: ledger invariant after 200 random operations; concurrent redemptions (balance and stock)
- [x] Tenant isolation suite extended to every new route, including ids passed in request bodies
- [x] Seed: ~300 customers with six months of history, daily stats and a portal demo customer
- [x] ADR 0003: points ledger

## 4. Merchant UI

- [x] Analytics endpoints (summary, daily, top rewards) for the dashboard
- [x] Same-origin `/api/v1` proxy, API client with single-flight session refresh (ADR 0004)
- [x] UI kit on Radix: accessible dialogs, menus and toasts; WCAG AA tokens; dark mode
- [x] Auth pages: login (with demo logins), register, forgot/reset password, accept invitation
- [x] Tenant switcher and app shell with role-aware navigation
- [x] Dashboard: KPI cards, 30-day points chart (with table view), top rewards
- [x] Customer table: search, tier/tag filters, sorting, cursor paging, cross-page selection,
      bulk actions and CSV export
- [x] Customer profile: balance, tier progress, ledger history, edit, adjust points, redeem
- [x] Record-purchase flow with customer lookup, inline enrolment and idempotent submission
- [x] Rewards, redemptions (fulfil by code), programme (business, earning rules, tiers,
      campaigns), team and audit log pages
- [x] Loading, empty and error states on every page
- [x] Playwright: merchant journey (programme → customer → purchase → redeem → fulfil) and bulk
      actions
- [x] ADR 0004: web app API access
- The billing page arrived with milestone 7; "Ask your data" is a proposed feature.

## 5. Events & worker

- [x] Outbox relay (`FOR UPDATE SKIP LOCKED`, batches of 100, publisher confirms)
- [x] RabbitMQ topology: queue per consumer, five backoff retry queues, dead-letter queue
- [x] Consumer idempotency via `ProcessedEvent`, committed with the handler's writes
- [x] Notifications consumer: tier reached, redemption fulfilled, points expiring in 7 days
- [x] Stats consumer: live `DailyStats` for the dashboard
- [x] Scheduled jobs behind a Redis lock: nightly FIFO points expiry, daily expiry warnings
- [x] Tests: relay ordering and concurrency, end-to-end stats, duplicates, retries to the DLQ,
      malformed messages, expiry invariant, once-a-day warnings
- [x] ADR 0005: transactional outbox

## 6. Customer portal

- [x] Portal auth: customer audience with a business claim, cookies scoped to one portal's path,
      rotating refresh tokens, login rate limiting
- [x] Joining by email link: every join request gets the same answer and an emailed link (new
      address: finishes joining; known address: claims the account made at the till), so the portal
      never reveals who is a customer; links are single-use and work at one business only
- [x] Portal API: business details, balance and tier progress, points history, catalogue,
      redeem, redemption history, all through the tenant-scoped services
- [x] Portal pages at `/c/[tenantSlug]`: sign in, join, set/forgot password, home, rewards with
      redeem-and-show-code, activity, my codes; mobile-first with loading, empty and error states
- [x] Merchant side: "Customer portal" link in the navigation; demo portal link on the login page
- [x] Tests: portal integration suite; portal isolation suite with route-coverage check
- [x] Playwright: the merchant journey now has the customer join via the emailed link and redeem
      in the portal; portal spec on desktop and phone
- [x] Fix: the web client accepted only 204 as an empty response, so forms answered with an empty
      202 (forgot password, join) showed an error
- [x] ADR 0006: customer portal sessions

## 7. Billing

- [x] Stripe Checkout and Billing Portal behind a `BillingGateway` interface; one Stripe
      customer per business; test-mode keys only; billing optional per installation (503 without
      keys)
- [x] Webhooks: signature verified over the raw body; event ids recorded in the same transaction
      as their effects (concurrent duplicates included); subscription re-read from Stripe under a
      tenant lock so out-of-order events cannot misapply; plan changes audited; owners emailed when
      a payment fails
- [x] Plan limits: Free plan capped at 100 customers with a 402 Problem Details, enforced under a
      tenant lock for dashboard, purchase-flow and portal enrolment; portal joiners get a
      customer-facing message
- [x] Billing page (owner only): plan, renewal/cancellation, usage meter, plan comparison,
      upgrade and manage buttons, confirmation polling after Checkout; upgrade prompt on 402
- [x] Tests: billing integration suite (checkout, portal, roles, webhooks, signatures,
      duplicates, ordering, limits, concurrency), isolation probes for the new routes, env
      validation, plan mapping; Playwright billing-page check
- [x] ADR 0007: billing and plan limits

## 8. AI "Ask your data"

Deferred: moved to [Proposed features](#proposed-features) for a later release.

## 9. Hardening

- [x] Security review and `docs/SECURITY.md` (threats, mitigations, tests, accepted risks)
- [x] Sign-up by emailed link: one answer for every address, so sign-up no longer reveals who
      has an account; every merchant email is verified
- [x] Login limited per IP across emails (password spraying); sign-up and reset emails limited
      per IP and per address
- [x] Membership changes lock the business, so concurrent removals cannot leave it ownerless
- [x] Web security headers: Content Security Policy, `frame-ancestors 'none'`, referrer policy,
      HSTS in production; Playwright checks pages run without CSP violations
- [x] Accessibility pass: axe-core scans every merchant, portal and sign-in page (and a dialog)
      for WCAG 2.2 A/AA in light and dark themes, on the seeded demo data; keyboard test for the
      skip link and dialog focus
- [x] Fix: dialogs opened from state returned focus to the page body on close; they now return
      it to the control that opened them
- [x] Playwright suite complete: merchant journey through the portal and back, bulk actions,
      portal, billing, security headers and accessibility; CI seeds the demo data first
- [x] Performance check: `pnpm db:seed:perf` (50k customers / 500k ledger entries) and
      `pnpm perf:customers` (p95 per list scenario over HTTP, 300 ms budget); results in README
- [x] Indexes for the customer list's name and points orders, trigram search and tag filters
- [x] Fix: deleting a business took 151 s at this size (unindexed ledger foreign keys); 0.1 s now
- [x] Fix: `pnpm db:seed` failed on a fresh clone (it needs the built shared package); seeding now
      builds its dependencies first

## 10. Release

- [ ] Dockerfiles
- [ ] `docs/DEPLOYMENT.md`
- [ ] Deploy
- [ ] Screenshots / GIF, final README polish

## Proposed features

Not scheduled; candidates for after the first release.

### AI "Ask your data"

Owners and admins ask questions about their business in plain language ("How many points did
we issue last month?"); a Pro-plan feature.

- [ ] `LlmProvider` interface with an Anthropic provider, and a deterministic `MockLlmProvider`
      used in tests and whenever `ANTHROPIC_API_KEY` is unset
- [ ] A fixed set of zod-validated tools over the tenant-scoped services (`getSummary`,
      `getDailyStats`, `getTopRewards`, `getTierDistribution`, `getCustomersAtRisk`); the model
      never writes SQL
- [ ] Answers only from tool results, aggregate only (no customer names or emails), with the tool
      calls shown under "How this was answered"
- [ ] `/app/[tenantId]/ask` chat-style page; OWNER and ADMIN only; Pro plan only (402 on Free)
- [ ] Rate limit of 20 questions per hour per business, capped max tokens, token usage logged
- [ ] Prompt-injection threat and mitigations in `docs/SECURITY.md`
