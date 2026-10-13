# ADR 0001: Shared database with a `tenantId` column for multi-tenancy

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

PointsHub serves many small merchants (cafés, salons, shops). Each merchant is a tenant whose
customers, ledger, rewards and analytics must never be visible to another tenant. Expected scale:
hundreds to low thousands of tenants, most with fewer than 10k customers, a few with 50k+.

We need an isolation model that is:

- safe by default (a forgotten filter must not leak data),
- cheap to operate on a single managed Postgres instance,
- simple to migrate (one schema change, applied once),
- able to support cross-tenant operational work (outbox relay, nightly expiry job, billing webhooks).

## Options considered

| Option                         | Isolation            | Ops cost | Migrations         | Cross-tenant jobs  | Notes                                                                                    |
| ------------------------------ | -------------------- | -------- | ------------------ | ------------------ | ---------------------------------------------------------------------------------------- |
| **Shared tables + `tenantId`** | Application-enforced | Lowest   | One run            | Trivial            | Needs discipline: every query must be scoped                                             |
| Shared tables + Postgres RLS   | Database-enforced    | Low      | One run            | Need a bypass role | Session variable per transaction; interacts awkwardly with connection pooling and Prisma |
| Schema per tenant              | Strong               | Medium   | N runs, drift risk | Query N schemas    | Connection pool per schema; Prisma has no first-class support                            |
| Database per tenant            | Strongest            | Highest  | N runs             | Hard               | Justified for regulated or very large tenants only                                       |

## Decision

Use **one shared database and shared tables, with a `tenantId` column on every tenant-owned row**,
and make the safe path the default path:

1. **Tenant context comes from authentication, never from the request body.** Merchant routes are
   `/api/v1/tenants/:tenantId/...`; a guard verifies the caller has a membership in that tenant
   before any handler runs.
2. **A Prisma Client extension injects `tenantId`** into every query on tenant-owned models and
   throws if no tenant context is set. Raw SQL helpers take `tenantId` as an explicit argument.
3. **Every tenant-owned table has an index that starts with `tenantId`**, so scoped queries stay
   fast and the planner never needs a cross-tenant scan.
4. **Cross-tenant access returns 404, not 403**, so the API does not reveal that another tenant's
   resource exists.
5. **A tenant isolation test suite** proves, for every tenant-scoped endpoint, that a user of
   tenant A cannot read or modify tenant B's resources.

## Consequences

- Positive: one migration path, one connection pool, simple analytics and background jobs, low
  hosting cost — appropriate for a product sold to small businesses.
- Positive: isolation is enforced in two places (route guard and query extension) and verified by
  tests, rather than relying on each developer remembering a `where` clause.
- Negative: a bug in the extension or a raw query could leak data across tenants. Mitigated by
  the isolation suite and by keeping raw SQL rare and reviewed.
- Negative: a noisy tenant shares resources with everyone else. Acceptable at this scale; per-tenant
  rate limits cover the expensive endpoints (AI, exports).
- Revisit if: a customer requires contractual physical isolation, or a single tenant grows large
  enough to dominate the database. Postgres RLS is the natural next layer of defence and can be
  added without changing the data model.
