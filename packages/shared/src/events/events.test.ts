import { EventEnvelopeSchema, EventPayloadSchemas, EventTypeSchema, parseEvent } from '.';

const valid = {
  id: '0192a6f0-0000-7000-8000-000000000001',
  type: 'points.earned',
  tenantId: 'tenant_1',
  occurredAt: '2026-01-01T12:00:00.000Z',
  version: 1,
  payload: { customerId: 'c_1', points: 42 },
};

describe('EventEnvelopeSchema', () => {
  it('accepts a well-formed event', () => {
    expect(EventEnvelopeSchema.parse(valid)).toEqual(valid);
  });

  it('rejects unknown event types', () => {
    expect(EventEnvelopeSchema.safeParse({ ...valid, type: 'points.stolen' }).success).toBe(false);
  });

  it('rejects other envelope versions', () => {
    expect(EventEnvelopeSchema.safeParse({ ...valid, version: 2 }).success).toBe(false);
  });

  it('requires an ISO timestamp', () => {
    expect(EventEnvelopeSchema.safeParse({ ...valid, occurredAt: 'yesterday' }).success).toBe(
      false,
    );
  });
});

describe('EventPayloadSchemas', () => {
  it('defines a payload for every event type', () => {
    expect(Object.keys(EventPayloadSchemas).sort()).toEqual([...EventTypeSchema.options].sort());
  });

  it('validates a points.earned payload', () => {
    const payload = {
      customerId: 'c',
      ledgerEntryId: 'l',
      points: 42,
      balanceAfter: 142,
      purchaseId: 'p',
      amount: '4.20',
    };
    expect(EventPayloadSchemas['points.earned'].parse(payload)).toEqual(payload);
    expect(EventPayloadSchemas['points.earned'].safeParse({ customerId: 'c' }).success).toBe(false);
  });
});

describe('parseEvent', () => {
  const event = {
    ...valid,
    type: 'points.expiring',
    payload: { customerId: 'c_1', points: 120, expiresOn: '2026-02-01' },
  };

  it('returns the event with its typed payload', () => {
    const parsed = parseEvent(event);
    expect(parsed.type).toBe('points.expiring');
    if (parsed.type === 'points.expiring') expect(parsed.payload.expiresOn).toBe('2026-02-01');
  });

  it('rejects a payload that does not match its type', () => {
    expect(() => parseEvent({ ...event, payload: { customerId: 'c_1', points: 0 } })).toThrow();
  });
});
