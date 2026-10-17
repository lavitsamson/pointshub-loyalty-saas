# Architecture Decision Records

Short records of decisions that are not obvious from the code. Each one states the context,
the options considered, the decision and its consequences.

| #                                           | Decision                                                           | Status   |
| ------------------------------------------- | ------------------------------------------------------------------ | -------- |
| [0001](0001-multi-tenancy.md)               | Shared database with a `tenantId` column for multi-tenancy         | Accepted |
| [0002](0002-authentication-and-sessions.md) | Cookie sessions with short-lived JWTs and rotating refresh tokens  | Accepted |
| [0003](0003-points-ledger.md)               | Append-only points ledger with a locked, cached balance            | Accepted |
| [0004](0004-web-app-api-access.md)          | Web app reaches the API through a same-origin proxy                | Accepted |
| [0005](0005-transactional-outbox.md)        | Transactional outbox with idempotent consumers                     | Accepted |
| [0006](0006-customer-portal-sessions.md)    | Portal sessions scoped to one business; claiming accounts by email | Accepted |
