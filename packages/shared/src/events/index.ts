import { z } from 'zod';

export const EVENTS_EXCHANGE = 'pointshub.events';

export const EventTypeSchema = z.enum([
  'customer.created',
  'points.earned',
  'points.redeemed',
  'points.adjusted',
  'points.expired',
  'points.expiring',
  'tier.changed',
  'redemption.fulfilled',
  'redemption.cancelled',
]);
export type EventType = z.infer<typeof EventTypeSchema>;

const Id = z.string().min(1);
const LedgerMovement = z.object({
  customerId: Id,
  ledgerEntryId: Id,
  points: z.number().int(),
  balanceAfter: z.number().int(),
});

/** Payload contract for each event type, version 1. */
export const EventPayloadSchemas = {
  'customer.created': z.object({ customerId: Id }),
  'points.earned': LedgerMovement.extend({ purchaseId: Id, amount: z.string() }),
  'points.redeemed': LedgerMovement.extend({ redemptionId: Id, rewardId: Id }),
  'points.adjusted': LedgerMovement.extend({ reason: z.string() }),
  'points.expired': LedgerMovement,
  /** Raised by the worker's daily scan: unspent points that will expire on `expiresOn`. */
  'points.expiring': z.object({
    customerId: Id,
    points: z.number().int().positive(),
    expiresOn: z.iso.date(),
  }),
  'tier.changed': z.object({
    customerId: Id,
    fromTierId: Id.nullable(),
    toTierId: Id,
    toTierName: z.string(),
  }),
  'redemption.fulfilled': z.object({ redemptionId: Id, customerId: Id, rewardId: Id }),
  'redemption.cancelled': z.object({
    redemptionId: Id,
    customerId: Id,
    rewardId: Id,
    pointsRefunded: z.number().int(),
  }),
} satisfies Record<EventType, z.ZodType>;

export type EventPayload<T extends EventType> = z.infer<(typeof EventPayloadSchemas)[T]>;

/**
 * Envelope shared by every event on the bus. Payloads are versioned with the
 * envelope so consumers can reject shapes they do not understand.
 */
export const EventEnvelopeSchema = z.object({
  id: z.string().min(1),
  type: EventTypeSchema,
  tenantId: z.string().min(1),
  occurredAt: z.iso.datetime(),
  version: z.literal(1),
  payload: z.record(z.string(), z.unknown()),
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

/** An envelope whose payload has been checked against the contract for its type. */
export type DomainEvent = {
  [T in EventType]: Omit<EventEnvelope, 'type' | 'payload'> & { type: T; payload: EventPayload<T> };
}[EventType];

/** Validates the envelope and then the payload for its type; throws a ZodError otherwise. */
export function parseEvent(raw: unknown): DomainEvent {
  const envelope = EventEnvelopeSchema.parse(raw);
  const payload = EventPayloadSchemas[envelope.type].parse(envelope.payload);
  return { ...envelope, payload } as DomainEvent;
}
