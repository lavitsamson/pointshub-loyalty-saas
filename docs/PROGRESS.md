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
- Billing and "Ask your data" pages arrive with milestones 7 and 8.

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
- [x] Account claiming: registering with a known email sends a set-password link (also used for
      forgotten passwords; single-use, one business only)
- [x] Portal API: business details, balance and tier progress, points history, catalogue,
      redeem, redemption history, all through the tenant-scoped services
- [x] Portal pages at `/c/[tenantSlug]`: sign in, join, set/forgot password, home, rewards with
      redeem-and-show-code, activity, my codes; mobile-first with loading, empty and error states
- [x] Merchant side: "Customer portal" link in the navigation; demo portal link on the login page
- [x] Tests: portal integration suite; portal isolation suite with route-coverage check
- [x] Playwright: the merchant journey now has the customer join via the emailed link and redeem
      in the portal; portal spec on desktop and phone
- [x] ADR 0006: customer portal sessions

## 7. Billing

- [ ] Stripe Checkout and Billing Portal
- [ ] Webhooks with idempotency
- [ ] Plan limits (402)

## 8. AI "Ask your data"

- [ ] Provider interface + Anthropic provider
- [ ] Tools
- [ ] Mock provider
- [ ] UI
- [ ] Rate limits and token logging

## 9. Hardening

- [ ] Security review and `docs/SECURITY.md`
- [ ] Accessibility pass
- [ ] Playwright suite complete
- [ ] Performance check (50k customers / 500k ledger entries)

## 10. Release

- [ ] Dockerfiles
- [ ] `docs/DEPLOYMENT.md`
- [ ] Deploy
- [ ] Screenshots / GIF, final README polish
