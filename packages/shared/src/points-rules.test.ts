import {
  calculatePointsEarned,
  type EarnInput,
  pointsDueToExpire,
  pointsExpiringBetween,
  tierFor,
  toScaled,
} from './points-rules';

describe('toScaled', () => {
  it.each([
    ['1.25', 2, 125n],
    ['1', 2, 100n],
    ['0.5', 4, 5000n],
    ['12.50', 2, 1250n],
    ['3.000', 2, 300n],
  ])('%s at %i places → %s', (value, places, expected) => {
    expect(toScaled(value, places)).toBe(expected);
  });

  it('rejects precision it would have to drop', () => {
    expect(() => toScaled('1.005', 2)).toThrow(/decimal places/);
  });

  it.each(['-1', 'abc', '', '1e3'])('rejects %p', (value) => {
    expect(() => toScaled(value, 2)).toThrow();
  });
});

describe('calculatePointsEarned', () => {
  const base: EarnInput = {
    amount: '10.00',
    pointsPerCurrencyUnit: '1',
    tierMultiplier: '1',
    campaignMultipliers: [],
  };
  const earn = (overrides: Partial<EarnInput>) => calculatePointsEarned({ ...base, ...overrides });

  it('applies the programme rate', () => {
    expect(earn({ pointsPerCurrencyUnit: '10' })).toBe(100);
  });

  it('multiplies by the tier multiplier', () => {
    expect(earn({ tierMultiplier: '1.5' })).toBe(15);
  });

  it('multiplies tier and campaign together', () => {
    expect(earn({ tierMultiplier: '1.25', campaignMultipliers: ['2'] })).toBe(25);
  });

  it('uses only the highest of several active campaigns', () => {
    expect(earn({ campaignMultipliers: ['1.5', '3', '2'] })).toBe(30);
  });

  it('ignores campaigns below 1x rather than reducing points', () => {
    expect(earn({ campaignMultipliers: ['0.5'] })).toBe(10);
  });

  it('rounds down to whole points', () => {
    // 9.99 × 1 × 1.25 = 12.4875
    expect(earn({ amount: '9.99', tierMultiplier: '1.25' })).toBe(12);
  });

  it('is exact where floating point is not', () => {
    // In IEEE doubles 0.1 × 3 × 10 = 3.0000000000000004 and 1.15 × 100 = 114.99999999999999.
    expect(earn({ amount: '0.30', pointsPerCurrencyUnit: '10' })).toBe(3);
    expect(earn({ amount: '1.15', pointsPerCurrencyUnit: '100' })).toBe(115);
  });

  it('supports fractional rates', () => {
    expect(earn({ amount: '7.00', pointsPerCurrencyUnit: '0.5' })).toBe(3);
  });

  it('earns nothing for tiny amounts', () => {
    expect(earn({ amount: '0.01' })).toBe(0);
  });
});

describe('tierFor', () => {
  const bronze = { id: 'bronze', minLifetimePoints: 0 };
  const silver = { id: 'silver', minLifetimePoints: 500 };
  const gold = { id: 'gold', minLifetimePoints: 1500 };
  const tiers = [gold, bronze, silver];

  it.each([
    [0, 'bronze'],
    [499, 'bronze'],
    [500, 'silver'],
    [1499, 'silver'],
    [1500, 'gold'],
    [99_999, 'gold'],
  ])('%i lifetime points → %s', (points, expected) => {
    expect(tierFor(tiers, points)?.id).toBe(expected);
  });

  it('never drops a customer to a lower tier', () => {
    expect(tierFor(tiers, 600, gold)?.id).toBe('gold');
  });

  it('returns null when no tier is reachable', () => {
    expect(tierFor([silver], 10)).toBeNull();
  });
});

describe('pointsDueToExpire (FIFO)', () => {
  const day = (n: number) => new Date(Date.UTC(2026, 0, n));
  const earn = (points: number, expiresOn: number | null) => ({
    points,
    expiresAt: expiresOn === null ? null : day(expiresOn),
  });
  const debit = (points: number) => ({ points: -points, expiresAt: null });

  it('expires an untouched lot once its date passes', () => {
    expect(pointsDueToExpire([earn(100, 10)], day(9))).toBe(0);
    expect(pointsDueToExpire([earn(100, 10)], day(10))).toBe(100);
  });

  it('spends the oldest points first', () => {
    // 100 (expires day 10) then 50 (day 20); spending 80 leaves 20 of the first lot.
    const movements = [earn(100, 10), earn(50, 20), debit(80)];
    expect(pointsDueToExpire(movements, day(15))).toBe(20);
    expect(pointsDueToExpire(movements, day(25))).toBe(70);
  });

  it('expires nothing that has already been spent', () => {
    expect(pointsDueToExpire([earn(100, 10), debit(100)], day(30))).toBe(0);
  });

  it('does not expire the same points twice', () => {
    // A previous run wrote off the 40 remaining points of the first lot.
    const movements = [earn(100, 10), debit(60), debit(40)];
    expect(pointsDueToExpire(movements, day(30))).toBe(0);
  });

  it('never expires credits without an expiry date', () => {
    const movements = [earn(30, null), earn(100, 10)];
    expect(pointsDueToExpire(movements, day(30))).toBe(100);
  });

  it('lets debits consume non-expiring credits in order too', () => {
    const movements = [earn(30, null), earn(100, 10), debit(50)];
    // The 30 non-expiring points go first, then 20 from the expiring lot.
    expect(pointsDueToExpire(movements, day(30))).toBe(80);
  });
});

describe('pointsExpiringBetween', () => {
  const day = (n: number) => new Date(Date.UTC(2026, 0, n));
  const earn = (points: number, expiresOn: number | null) => ({
    points,
    expiresAt: expiresOn === null ? null : day(expiresOn),
  });
  const debit = (points: number) => ({ points: -points, expiresAt: null });

  it('counts unspent points in lots expiring inside the window', () => {
    const movements = [earn(100, 10), earn(50, 12), earn(70, 20), debit(30)];
    // Window [10, 13): the first lot (70 left after the debit) and the second (50).
    expect(pointsExpiringBetween(movements, day(10), day(13))).toBe(120);
  });

  it('includes the start of the window and excludes the end', () => {
    const movements = [earn(10, 10), earn(20, 11)];
    expect(pointsExpiringBetween(movements, day(10), day(11))).toBe(10);
  });

  it('ignores spent lots and credits that never expire', () => {
    const movements = [earn(40, 10), earn(25, null), debit(40)];
    expect(pointsExpiringBetween(movements, day(1), day(30))).toBe(0);
  });
});
