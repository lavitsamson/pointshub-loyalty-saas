# Architecture

## System overview

```mermaid
flowchart LR
  subgraph Clients
    M[Merchant dashboard<br/>/app]
    C[Customer portal<br/>/c/:tenantSlug]
  end

  subgraph Web["apps/web (Next.js)"]
    M
    C
  end

  API["apps/api<br/>NestJS REST /api/v1"]
  W["apps/worker<br/>NestJS standalone"]
  PG[(PostgreSQL)]
  R[(Redis)]
  MQ{{RabbitMQ<br/>pointshub.events}}
  MAIL[SMTP / Mailpit]
  STRIPE[Stripe]
  LLM[Anthropic API]

  Web -->|/api/v1 proxied, httpOnly cookies| API
  API --> PG
  API --> R
  API -->|AI tools| LLM
  STRIPE -->|webhooks| API
  API -->|Checkout / Portal| STRIPE
  W -->|outbox relay| PG
  W -->|publish| MQ
  MQ -->|consume| W
  W --> MAIL
  W --> R
```

## Components

| Component         | Responsibility                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web`        | Merchant dashboard and customer portal. Forwards `/api/v1` to the API so the browser stays on one origin ([ADR 0004](adr/0004-web-app-api-access.md)). |
| `apps/api`        | REST API. Authentication, authorisation, tenant scoping, all writes. Writes domain events to the outbox in the same transaction as the change.         |
| `apps/worker`     | Background work: outbox relay → RabbitMQ, event consumers (notifications, daily stats), scheduled jobs (points expiry).                                |
| `packages/shared` | zod schemas and types shared by API and web: request/response contracts, enums, event envelope, Problem Details.                                       |
| `packages/db`     | Prisma schema, migrations and the client factory.                                                                                                      |
| `packages/config` | Shared TypeScript, ESLint and Prettier configuration.                                                                                                  |

## Key flows

### Recording a purchase

```mermaid
sequenceDiagram
  participant Staff as Staff (web)
  participant API
  participant DB as PostgreSQL
  participant Relay as Worker: outbox relay
  participant MQ as RabbitMQ
  participant Stats as Worker: stats consumer

  Staff->>API: POST /tenants/:id/purchases (Idempotency-Key)
  API->>DB: BEGIN
  API->>DB: SELECT customer FOR UPDATE
  API->>DB: INSERT purchase, ledger entry (balanceAfter)
  API->>DB: UPDATE customer balance / lifetime points / tier
  API->>DB: INSERT outbox event (points.earned)
  API->>DB: COMMIT
  API-->>Staff: 201 points earned
  Relay->>DB: SELECT unpublished FOR UPDATE SKIP LOCKED
  Relay->>MQ: publish points.earned
  Relay->>DB: SET publishedAt
  MQ->>Stats: points.earned
  Stats->>DB: UPSERT DailyStats (idempotent via ProcessedEvent)
```

### Web app data flow

Pages under `/app` are client components. A session gate loads `/auth/me` and redirects to the
login page when there is no session; the tenant layout resolves the membership for the business in
the URL and exposes the member's role to the page. Data comes from TanStack Query hooks in
`apps/web/src/lib/api`, keyed by tenant and area so a mutation can refresh exactly what it
affected. The API client sends the CSRF header, renews an expired access token once (shared by
concurrent requests and across tabs) and turns error bodies into typed Problem Details.

## Cross-cutting concerns

- **Multi-tenancy:** shared tables with `tenantId`; see [ADR 0001](adr/0001-multi-tenancy.md).
- **Errors:** every error response is RFC 9457 Problem Details (`application/problem+json`).
- **Validation:** zod schemas from `packages/shared`, applied by a Nest validation pipe.
- **Logging:** structured JSON via pino; every request carries an `x-request-id` that is accepted
  from upstream or generated, and echoed back.
- **Health:** `GET /api/v1/health/live` (process up) and `GET /api/v1/health/ready` (database,
  Redis and RabbitMQ reachable, each with a 2 s timeout).
- **Ledger integrity:** `PointsLedgerEntry` is append-only, enforced by a database trigger as well
  as by application code.
