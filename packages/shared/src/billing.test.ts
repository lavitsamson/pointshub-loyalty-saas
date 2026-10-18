import { PLAN_LIMITS, planForSubscription } from './billing';

describe('planForSubscription', () => {
  it.each(['active', 'trialing', 'past_due'])('keeps Pro while the subscription is %s', (s) => {
    expect(planForSubscription(s)).toBe('PRO');
  });

  it.each(['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', 'something_new'])(
    'falls back to Free when the subscription is %s',
    (s) => {
      expect(planForSubscription(s)).toBe('FREE');
    },
  );

  it('is Free without a subscription', () => {
    expect(planForSubscription(null)).toBe('FREE');
    expect(planForSubscription(undefined)).toBe('FREE');
  });
});

describe('plan limits', () => {
  it('match the published plans', () => {
    expect(PLAN_LIMITS.FREE).toEqual({ maxCustomers: 100 });
    expect(PLAN_LIMITS.PRO).toEqual({ maxCustomers: null });
  });
});
