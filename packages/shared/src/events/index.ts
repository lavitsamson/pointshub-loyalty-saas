import { z } from 'zod';

export const EVENTS_EXCHANGE = 'pointshub.events';

export const EventTypeSchema = z.enum([
  'customer.created',
  'points.earned',
  'points.redeemed',
  'points.adjusted',
  'points.expired',
  'tier.changed',
  'redemption.fulfilled',
  'redemption.cancelled',
]);
export type EventType = z.infer<typeof EventTypeSchema>;

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
