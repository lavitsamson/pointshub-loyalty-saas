import { EventEnvelopeSchema } from '.';

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
