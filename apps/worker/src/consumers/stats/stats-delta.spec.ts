import { type DomainEvent, parseEvent } from '@pointshub/shared';
import { statsDelta } from './stats-delta';

const event = (type: string, payload: Record<string, unknown>): DomainEvent =>
  parseEvent({
    id: '0192a6f0-0000-7000-8000-000000000001',
    type,
    tenantId: 'tenant_1',
    occurredAt: '2026-03-14T23:59:59.000Z',
    version: 1,
    payload,
  });

const movement = { customerId: 'c', ledgerEntryId: 'l', balanceAfter: 100 };

describe('statsDelta', () => {
  it('counts a new customer on the day the event occurred (UTC)', () => {
    expect(statsDelta(event('customer.created', { customerId: 'c' }))).toEqual({
      date: '2026-03-14',
      pointsEarned: 0,
      pointsRedeemed: 0,
      newCustomers: 1,
      purchases: 0,
      revenue: '0',
    });
  });

  it('counts a purchase, its revenue and the points earned', () => {
    const delta = statsDelta(
      event('points.earned', { ...movement, points: 42, purchaseId: 'p', amount: '12.50' }),
    );
    expect(delta).toMatchObject({ pointsEarned: 42, purchases: 1, revenue: '12.50' });
  });

  it('counts redeemed points as a positive number', () => {
    const delta = statsDelta(
      event('points.redeemed', { ...movement, points: -300, redemptionId: 'r', rewardId: 'w' }),
    );
    expect(delta).toMatchObject({ pointsRedeemed: 300, pointsEarned: 0 });
  });

  it('takes cancelled redemptions back off', () => {
    const delta = statsDelta(
      event('redemption.cancelled', {
        redemptionId: 'r',
        customerId: 'c',
        rewardId: 'w',
        pointsRefunded: 300,
      }),
    );
    expect(delta).toMatchObject({ pointsRedeemed: -300 });
  });

  it('ignores events that do not affect daily stats', () => {
    expect(
      statsDelta(event('points.adjusted', { ...movement, points: 10, reason: 'Goodwill' })),
    ).toBeNull();
  });
});
