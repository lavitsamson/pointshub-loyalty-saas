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
- [x] GitHub Actions CI
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
- [ ] Auth pages in the web app (part of milestone 4)

## 3. Core loyalty

- [ ] Programme, tiers, campaigns
- [ ] Customers CRUD, bulk actions, CSV export
- [ ] Purchases with idempotency
- [ ] Ledger and adjustments
- [ ] Rewards and redemptions
- [ ] Ledger invariant test (200 random operations)
- [ ] Concurrent redemption test
- [ ] Seed: customers and six months of purchase history

## 4. Merchant UI

- [ ] All dashboard pages
- [ ] Customer table with bulk actions and export
- [ ] Record-purchase flow

## 5. Events & worker

- [ ] Outbox relay
- [ ] RabbitMQ topology with DLQ
- [ ] Notifications consumer
- [ ] Stats consumer
- [ ] Scheduled points expiry
- [ ] ADR: transactional outbox

## 6. Customer portal

- [ ] Portal auth
- [ ] Portal pages

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
