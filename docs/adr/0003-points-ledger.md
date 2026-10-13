# ADR 0003: Append-only points ledger with a locked, cached balance

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

Points are a liability on the merchant's books and a promise to the customer. Every balance must
be explainable ("why do I have 340 points?"), must never go negative, and must stay correct when
staff at two tills redeem for the same customer at the same moment or a flaky connection retries
a purchase.

## Decision

**The ledger is the source of truth.** Every change is a new `PointsLedgerEntry` (EARN, REDEEM,
EXPIRE, ADJUST, REVERSAL) with a signed `points` value and the resulting `balanceAfter`. Rows are
never updated: application code has no update path, and a database trigger rejects `UPDATE`
statements outright. Corrections are new entries — cancelling a redemption writes a REVERSAL.

**The balance is a cache, maintained in the same transaction.** `Customer.pointsBalance` and
`lifetimePoints` are updated together with the ledger insert, so reading a balance is a primary
key lookup rather than a `SUM` over history. An integration test runs 200 random operations and
then checks `pointsBalance = SUM(points)` for every customer.

**One code path, one lock order.** All movements go through `LedgerService`, which:

1. locks the customer row with `SELECT ... FOR UPDATE`,
2. rejects the movement with 409 if the balance would go negative,
3. appends the entry and updates the cached balance (and tier, after earning),
4. writes the outbox event in the same transaction.

Redemptions also lock the reward row (for stock), always _after_ the customer row; bulk actions
lock customers in id order. A consistent order means concurrent transactions queue rather than
deadlock. Tests fire 10 redemptions at once against a balance that covers 3, and 8 customers at a
reward with 2 in stock.

**Exactly-once purchases.** `POST /purchases` requires an `Idempotency-Key`. The key is stored on
the purchase under a unique `(tenantId, idempotencyKey)` constraint; a retry returns the original
result (flagged with `Idempotent-Replayed: true`), a race between identical retries is resolved
by the constraint, and reusing a key for a different purchase is rejected with 422.

**Exact arithmetic.** Amounts and multipliers are decimal strings computed as scaled integers
(`BigInt`), never floats: `floor(amount × rate × tier × best campaign)`. The rules live in
`packages/shared` so the worker applies them identically.

**FIFO expiry is derived, not stored.** Each credit is a lot; debits consume the oldest lots
first; whatever remains in lots past their expiry is due to expire. Because this is computed from
the ledger, no per-lot "remaining" column has to be kept in sync (which would break append-only).

## Alternatives considered

- **Balance only (no ledger).** Cheapest, but unexplainable and unauditable.
- **Ledger only (balance = `SUM` on read).** Always correct, but every list and every check reads
  the whole history; also needs a separate lock target for concurrency.
- **Optimistic concurrency (version column + retry).** Works, but under contention (two tills,
  one customer) it turns into retry loops; a short row lock is simpler and predictable here.
- **`SERIALIZABLE` isolation everywhere.** Correct but blunt: every conflicting transaction
  fails and must be retried by the caller.

## Consequences

- Balances are always explainable from history, and history cannot be rewritten.
- Writes for one customer are serialised; writes for different customers run in parallel.
  This is the right trade-off for a café till, not for a high-frequency trading system.
- Bulk adjustments of 500 customers hold 500 row locks for a few seconds; the transaction
  timeout is raised for that path only.
