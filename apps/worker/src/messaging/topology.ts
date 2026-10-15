import { EVENTS_EXCHANGE, type EventType } from '@pointshub/shared';
import type { Channel } from 'amqplib';
import { RETRY_LEVELS } from '../config/env';

/** What the broker needs to know about a consumer: its name and the events it wants. */
export interface ConsumerBinding {
  readonly name: string;
  readonly eventTypes: readonly EventType[];
}

export interface ConsumerQueues {
  /** Bound to the events exchange; the consumer reads from here. */
  main: string;
  /**
   * One holding queue per retry. A failed message is parked in the queue for its attempt
   * with a per-message expiry; when it expires, RabbitMQ dead-letters it back to `main`.
   * Every message in a given queue waits the same time, so none is stuck behind a
   * longer-waiting one.
   */
  retries: string[];
  /** Messages that failed every retry, or could never succeed. Inspected by a human. */
  deadLetter: string;
}

export function queuesFor(consumer: string): ConsumerQueues {
  const main = `pointshub.${consumer}`;
  return {
    main,
    retries: Array.from({ length: RETRY_LEVELS }, (_, i) => `${main}.retry.${i + 1}`),
    deadLetter: `${main}.dlq`,
  };
}

/**
 * Declares the exchange and every consumer's queues. Idempotent, so it runs on each
 * (re)connect; the API never declares anything and only the relay publishes.
 */
export async function assertTopology(
  channel: Channel,
  consumers: readonly ConsumerBinding[],
): Promise<void> {
  await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });

  for (const consumer of consumers) {
    const queues = queuesFor(consumer.name);
    await channel.assertQueue(queues.main, { durable: true });
    for (const type of consumer.eventTypes) {
      await channel.bindQueue(queues.main, EVENTS_EXCHANGE, type);
    }
    for (const retry of queues.retries) {
      // '' is the default exchange, which routes by queue name.
      await channel.assertQueue(retry, {
        durable: true,
        deadLetterExchange: '',
        deadLetterRoutingKey: queues.main,
      });
    }
    await channel.assertQueue(queues.deadLetter, { durable: true });
  }
}
