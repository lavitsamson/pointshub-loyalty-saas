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

- [ ] Register / login / refresh / logout / me
- [ ] Forgot / reset password
- [ ] Refresh token rotation with reuse detection
- [ ] Login rate limiting (Redis)
- [ ] CSRF custom-header guard
- [ ] Memberships and roles guard
- [ ] Prisma tenant extension
- [ ] Tenant isolation test harness
- [ ] Invitations
- [ ] Seed: tenants, users, memberships, programme, tiers

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
