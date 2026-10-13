# Architecture Decision Records

Short records of decisions that are not obvious from the code. Each one states the context,
the options considered, the decision and its consequences.

| #                                           | Decision                                                          | Status   |
| ------------------------------------------- | ----------------------------------------------------------------- | -------- |
| [0001](0001-multi-tenancy.md)               | Shared database with a `tenantId` column for multi-tenancy        | Accepted |
| [0002](0002-authentication-and-sessions.md) | Cookie sessions with short-lived JWTs and rotating refresh tokens | Accepted |
| [0003](0003-points-ledger.md)               | Append-only points ledger with a locked, cached balance           | Accepted |
