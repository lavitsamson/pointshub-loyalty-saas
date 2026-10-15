import type { Prisma } from '@pointshub/db';
import type { DomainEvent } from '@pointshub/shared';
import type { ConsumerBinding } from './topology';

/**
 * A subscriber to domain events. The runner validates each message, then calls `handle`
 * inside the transaction that records the event as processed: database writes made with
 * `tx` happen exactly once, and a thrown error rolls them back and schedules a retry.
 */
export interface EventConsumer extends ConsumerBinding {
  handle(event: DomainEvent, tx: Prisma.TransactionClient): Promise<void>;
}

/** Injection token for the list of consumers the worker runs. */
export const EVENT_CONSUMERS = Symbol('EVENT_CONSUMERS');
