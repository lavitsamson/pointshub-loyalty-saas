# ADR 0005: Transactional outbox with idempotent consumers

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

When points change, other things must follow: daily statistics for the dashboard, an email when a
customer reaches a new tier, an email when a reward is handed over. These must not slow down or
break the till: a purchase must succeed even if the mail server or the broker is down.

The naive approach — commit the transaction, then publish to RabbitMQ — has two failure modes.
If the process dies between the commit and the publish, the event is lost. If the API publishes
before committing and the transaction then rolls back, consumers act on something that never
happened. A database and a broker cannot share one transaction.

## Decision

**Write events to an outbox table in the same transaction as the change.** Every mutation that
raises an event inserts an `OutboxEvent` row alongside its own writes (ADR 0003). The event exists
if and only if the change committed. The API never talks to the broker on the request path.

**A relay in the worker moves the outbox to RabbitMQ.** It claims up to 100 unpublished rows with
`SELECT ... FOR UPDATE SKIP LOCKED`, publishes them to the `pointshub.events` topic exchange
(routing key = event type) on a confirm channel, waits for the broker's confirms, then sets
`publishedAt` and commits. `SKIP LOCKED` lets several worker instances relay in parallel without
claiming the same rows. If publishing fails, the transaction rolls back and the rows are retried
on the next poll (every second, or immediately after a full batch).

This gives **at-least-once** delivery: a crash after the broker confirms but before the commit
republishes the batch. So **consumers are idempotent.** Each consumer inserts a
`ProcessedEvent (consumer, eventId)` row in the same transaction as its own writes, with
`ON CONFLICT DO NOTHING`; a duplicate finds the row already there and is skipped. For the stats
consumer this makes counting exactly-once. Emails cannot join a database transaction, so a crash
between sending and committing can send the same email twice. For a notification, that is the
right side to err on.

**Failures back off, then dead-letter.** Each consumer has its own queue, five retry queues and a
dead-letter queue:

```
pointshub.events ──(binding per event type)──▶ pointshub.stats ──▶ consumer
                                                  ▲        │ fails
                          message TTL expires     │        ▼
                 pointshub.stats.retry.1 … .retry.5 ◀── retry n (1 s, 5 s, 30 s, 2 min, 10 min)
                                                           │ sixth failure, or malformed
                                                           ▼
                                                  pointshub.stats.dlq
```

A failed message is republished to the holding queue for its next attempt with a per-message
expiry; when it expires, RabbitMQ dead-letters it back to the main queue. Because each holding
queue only ever contains messages with the same delay, none waits behind a longer one. The
original is acknowledged only after the broker confirms the copy, so nothing is lost. Messages
that cannot ever succeed (malformed, wrong contract version) go straight to the DLQ. The retry
count and last error travel in headers, so the DLQ is readable in the RabbitMQ management UI.

**The worker raises events too.** The nightly expiry job writes `points.expired` through the
outbox, following the ledger rules from ADR 0003 (customer row lock, `balanceAfter`, cached
balance). The daily expiry-warning scan raises `points.expiring`, a ninth event type added for
this. As a result, "your points expire in 7 days" emails get the same retries and deduplication as every
other email, and the scan does not need its own mail code. Scheduled jobs run in every worker
instance but take a Redis lock, so each occurrence runs once.

**The worker is cross-tenant by design.** It uses the plain Prisma client rather than the
request-scoped tenant extension (ADR 0001); every query names the tenant explicitly, taken from
the event envelope or the job's per-tenant loop.

## Alternatives considered

- **Publish after commit, in the API.** Simple, but loses events on a crash and couples request
  latency to broker health.
- **Change data capture (Debezium reading the WAL).** No polling and no outbox writes in code, but
  it adds Kafka Connect or similar to operate. Too much infrastructure for this scale.
- **Postgres `LISTEN/NOTIFY` to wake the relay.** Would cut the up-to-1-second delay; polling is
  simpler and fast enough for dashboards and emails. Easy to add later.
- **Retries by `nack` and requeue.** Requeued messages come straight back, so a failing consumer
  spins hot and blocks the queue. A single retry queue with per-message TTLs suffers head-of-line
  blocking, as RabbitMQ only expires messages at the head of a queue.
- **The delayed-message exchange plugin.** Cleaner retries, but it is a plugin with its own
  durability caveats; plain queues work on any RabbitMQ.

## Consequences

- Business writes never depend on the broker; events are delayed, never lost, while it is down.
- Events can arrive twice and out of order across event types. Consumers are written for that:
  stats are commutative increments, and emails do not depend on order.
- Published outbox rows accumulate. They are small and indexed on `publishedAt`; a retention job
  can trim them when it matters.
- A message in the DLQ needs a human: inspect it in the management UI, fix the cause, and move it
  back with a shovel.
