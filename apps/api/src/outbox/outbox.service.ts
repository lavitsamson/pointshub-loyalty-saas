import { Injectable } from '@nestjs/common';
import { type EventPayload, EventPayloadSchemas, type EventType } from '@pointshub/shared';
import type { ScopedTransaction } from '../tenancy/tenant-scope';

/**
 * Transactional outbox. Events are inserted in the same transaction as the change they
 * describe, so an event exists if and only if the change committed. The worker's relay
 * publishes them to RabbitMQ afterwards.
 */
@Injectable()
export class OutboxService {
  async add<T extends EventType>(
    tx: ScopedTransaction,
    tenantId: string,
    type: T,
    payload: EventPayload<T>,
  ): Promise<void> {
    // Validate on the way in: a malformed event would otherwise only fail in a consumer.
    const parsed = EventPayloadSchemas[type].parse(payload) as Record<string, unknown>;
    await tx.outboxEvent.create({ data: { tenantId, type, payload: parsed } as never });
  }
}
