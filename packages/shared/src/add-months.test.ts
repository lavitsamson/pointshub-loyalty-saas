import { addMonths } from './points-rules';

describe('addMonths', () => {
  const utc = (iso: string) => new Date(iso);

  it.each([
    ['2026-01-15T10:00:00.000Z', 12, '2027-01-15T10:00:00.000Z'],
    ['2026-01-31T00:00:00.000Z', 1, '2026-02-28T00:00:00.000Z'],
    ['2028-01-31T00:00:00.000Z', 1, '2028-02-29T00:00:00.000Z'],
    ['2026-11-30T23:59:59.000Z', 3, '2027-02-28T23:59:59.000Z'],
  ])('%s + %i months → %s', (from, months, expected) => {
    expect(addMonths(utc(from), months).toISOString()).toBe(expected);
  });

  it('does not mutate its input', () => {
    const date = utc('2026-01-15T00:00:00.000Z');
    addMonths(date, 6);
    expect(date.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });
});
