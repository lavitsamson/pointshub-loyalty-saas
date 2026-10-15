import type { DomainEvent } from '@pointshub/shared';

/** What one event adds to its tenant's DailyStats row for the day it occurred. */
export interface StatsDelta {
  /** UTC calendar day, `YYYY-MM-DD`. */
  date: string;
  pointsEarned: number;
  pointsRedeemed: number;
  newCustomers: number;
  purchases: number;
  /** Decimal string, added exactly by the database. */
  revenue: string;
}

const zero = { pointsEarned: 0, pointsRedeemed: 0, newCustomers: 0, purchases: 0, revenue: '0' };

/**
 * Maps an event to its contribution to daily stats, or null if it does not affect them.
 * Redeemed points are net of cancellations: a cancelled redemption is taken back off the
 * day it was cancelled, the same rule the seed data follows.
 */
export function statsDelta(event: DomainEvent): StatsDelta | null {
  const date = event.occurredAt.slice(0, 10);
  switch (event.type) {
    case 'customer.created':
      return { ...zero, date, newCustomers: 1 };
    case 'points.earned':
      return {
        ...zero,
        date,
        pointsEarned: event.payload.points,
        purchases: 1,
        revenue: event.payload.amount,
      };
    case 'points.redeemed':
      return { ...zero, date, pointsRedeemed: -event.payload.points };
    case 'redemption.cancelled':
      return { ...zero, date, pointsRedeemed: -event.payload.pointsRefunded };
    default:
      return null;
  }
}
