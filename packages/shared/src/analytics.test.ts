import {
  DateRangeQuerySchema,
  daysInRange,
  eachDay,
  MAX_REPORT_DAYS,
  resolveDateRange,
  TopRewardsQuerySchema,
} from './analytics';

describe('DateRangeQuerySchema', () => {
  it('accepts an empty query', () => {
    expect(DateRangeQuerySchema.parse({})).toEqual({});
  });

  it('rejects a range that ends before it starts', () => {
    const result = DateRangeQuerySchema.safeParse({ from: '2026-03-02', to: '2026-03-01' });
    expect(result.success).toBe(false);
  });

  it(`rejects a range longer than ${MAX_REPORT_DAYS} days`, () => {
    expect(DateRangeQuerySchema.safeParse({ from: '2025-01-01', to: '2026-01-01' }).success).toBe(
      true,
    );
    expect(DateRangeQuerySchema.safeParse({ from: '2025-01-01', to: '2026-01-03' }).success).toBe(
      false,
    );
  });

  it('rejects anything that is not a calendar date', () => {
    expect(DateRangeQuerySchema.safeParse({ from: '2026-02-30' }).success).toBe(false);
    expect(DateRangeQuerySchema.safeParse({ from: '2026-01-01T00:00:00Z' }).success).toBe(false);
  });
});

describe('TopRewardsQuerySchema', () => {
  it('defaults and coerces the limit', () => {
    expect(TopRewardsQuerySchema.parse({})).toEqual({ limit: 5 });
    expect(TopRewardsQuerySchema.parse({ limit: '10' })).toEqual({ limit: 10 });
    expect(TopRewardsQuerySchema.safeParse({ limit: '21' }).success).toBe(false);
  });
});

describe('resolveDateRange', () => {
  const today = new Date('2026-03-31T18:00:00Z');

  it('defaults to the 30 days ending today', () => {
    expect(resolveDateRange({}, today)).toEqual({ from: '2026-03-02', to: '2026-03-31' });
  });

  it('extends a single end to 30 days', () => {
    expect(resolveDateRange({ to: '2026-01-30' }, today)).toEqual({
      from: '2026-01-01',
      to: '2026-01-30',
    });
    expect(resolveDateRange({ from: '2026-01-01' }, today)).toEqual({
      from: '2026-01-01',
      to: '2026-01-30',
    });
  });

  it('keeps an explicit range', () => {
    expect(resolveDateRange({ from: '2026-01-01', to: '2026-01-01' }, today)).toEqual({
      from: '2026-01-01',
      to: '2026-01-01',
    });
  });
});

describe('daysInRange and eachDay', () => {
  it('counts both ends', () => {
    expect(daysInRange('2026-01-01', '2026-01-01')).toBe(1);
    expect(daysInRange('2026-02-27', '2026-03-02')).toBe(4);
  });

  it('lists every day across a month end, ignoring DST', () => {
    expect(eachDay({ from: '2026-03-28', to: '2026-04-01' })).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
    ]);
  });
});
