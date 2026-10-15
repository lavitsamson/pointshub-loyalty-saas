import type { Prisma } from '@pointshub/db';
import { type EventPayload, EventPayloadSchemas, type EventType } from '@pointshub/shared';

/**
 * Builds an outbox row for an event the worker raises itself (expiry, expiry warnings).
 * The payload is validated on the way in, as the API does for its events.
 */
export function outboxEvent<T extends EventType>(
  tenantId: string,
  type: T,
  payload: EventPayload<T>,
): Prisma.OutboxEventCreateManyInput {
  const parsed = EventPayloadSchemas[type].parse(payload) as Prisma.InputJsonObject;
  return { tenantId, type, payload: parsed };
}
