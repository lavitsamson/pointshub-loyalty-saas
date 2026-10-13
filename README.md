# PointsHub

**Multi-tenant loyalty and rewards platform for cafés, salons and local shops.**
Staff record purchases, customers earn points and climb tiers, and owners see what keeps their
regulars coming back.

> Status: in active development — see [progress](docs/PROGRESS.md).

## Features

Planned for v1 (tracked in [docs/PROGRESS.md](docs/PROGRESS.md)):

- **Merchant dashboard** — KPIs, customer table with bulk actions and CSV export, a fast
  record-purchase flow, rewards, redemptions, team management and an audit log.
- **Points engine** — tier and campaign multipliers, FIFO expiry, an append-only ledger with a
  tested balance invariant, idempotent purchases and overspend-proof redemptions.
- **Customer portal** — balance, tier progress, rewards catalogue and redemption codes; mobile-first.
- **Events** — transactional outbox → RabbitMQ → idempotent consumers for emails and daily stats.
- **Billing** — Stripe Checkout, Billing Portal and verified, de-duplicated webhooks (test mode).
- **Ask your data** — plain-language analytics backed by a fixed set of tenant-scoped tools; the
  model never writes SQL.

## Architecture

```mermaid
flowchart LR
  Web["Next.js<br/>dashboard + portal"] -->|REST, httpOnly cookies| API["NestJS API"]
  API --> PG[(PostgreSQL)]
  API --> Redis[(Redis)]
  Worker["NestJS worker"] -->|outbox relay| PG
  Worker <-->|pointshub.events| MQ{{RabbitMQ}}
  Worker --> Mail[SMTP]
```

More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tech stack

| Area              | Choice                                                             |
| ----------------- | ------------------------------------------------------------------ |
| Monorepo          | pnpm workspaces, Turborepo                                         |
| Language          | TypeScript (strict, `noUncheckedIndexedAccess`)                    |
| Web               | Next.js (App Router), React, Tailwind CSS                          |
| API / worker      | NestJS, zod validation, OpenAPI                                    |
| Data              | PostgreSQL, Prisma                                                 |
| Messaging / cache | RabbitMQ, Redis                                                    |
| Observability     | pino structured logs with request ids, health and readiness probes |
| Testing           | Jest, Supertest, Testcontainers, Playwright                        |
| CI                | GitHub Actions                                                     |

## Getting started

Prerequisites: Node.js 24, pnpm 12 (`corepack enable`), Docker.

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm dev
```

| Service                  | URL                                                |
| ------------------------ | -------------------------------------------------- |
| Web app                  | http://localhost:3000                              |
| API                      | http://localhost:4000/api/v1                       |
| API docs (OpenAPI)       | http://localhost:4000/api/docs                     |
| RabbitMQ management      | http://localhost:15672 (`pointshub` / `pointshub`) |
| Mailpit (captured email) | http://localhost:8025                              |

## Commands

| Command           | What it does                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm dev`        | Runs web, API and worker in watch mode                                                            |
| `pnpm build`      | Builds every package                                                                              |
| `pnpm lint`       | ESLint across the workspace                                                                       |
| `pnpm typecheck`  | `tsc --noEmit` across the workspace                                                               |
| `pnpm test`       | Unit tests                                                                                        |
| `pnpm test:int`   | API integration tests against real Postgres, Redis and RabbitMQ (Testcontainers; Docker required) |
| `pnpm test:e2e`   | Playwright end-to-end tests                                                                       |
| `pnpm db:migrate` | Creates/applies migrations in development                                                         |
| `pnpm db:deploy`  | Applies committed migrations (CI, production)                                                     |

## Testing

- **Unit** tests sit next to the code (`*.spec.ts` / `*.test.ts`) and need no services.
- **Integration** tests (`apps/api/test/*.int-spec.ts`) start throwaway containers, apply the
  real migrations and exercise the API through HTTP with the production middleware stack.
- **End-to-end** tests (`apps/web/e2e`) drive the built web app in Chromium and a mobile viewport.

## Design decisions

- [ADR 0001 — Multi-tenancy](docs/adr/0001-multi-tenancy.md): one shared database with a
  `tenantId` on every row, enforced by a route guard, a Prisma extension and an isolation test suite.

Smaller decisions worth knowing:

- **Append-only ledger enforced in the database.** A trigger rejects any `UPDATE` on
  `PointsLedgerEntry`, so balances can always be rebuilt from history.
- **Supply-chain guard.** `pnpm-workspace.yaml` sets `minimumReleaseAge` to 14 days and dependency
  install scripts are opt-in.
- **TypeScript 6.** TypeScript 7 is available, but typescript-eslint, ts-jest and `@nestjs/swagger`
  do not support it yet.

## How I used AI

See [docs/AI_USAGE.md](docs/AI_USAGE.md).

## Author

**Lavit Samson** — Senior Full-Stack Engineer · [linkedin.com/in/lavit-samson](https://linkedin.com/in/lavit-samson)
