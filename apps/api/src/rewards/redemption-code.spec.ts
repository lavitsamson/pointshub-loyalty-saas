import { generateRedemptionCode, normalizeRedemptionCode } from './redemption-code';

describe('generateRedemptionCode', () => {
  it('has the XXX-XXX shape and avoids look-alike characters', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateRedemptionCode()).toMatch(/^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{3}$/);
    }
  });

  it('is effectively unique', () => {
    const codes = new Set(Array.from({ length: 2000 }, generateRedemptionCode));
    expect(codes.size).toBeGreaterThan(1995);
  });
});

describe('normalizeRedemptionCode', () => {
  it.each([
    ['k7q-4mp', 'K7Q-4MP'],
    ['K7Q4MP', 'K7Q-4MP'],
    [' k7q 4mp ', 'K7Q-4MP'],
  ])('%p → %p', (input, expected) => {
    expect(normalizeRedemptionCode(input)).toBe(expected);
  });

  it('leaves partial codes unformatted', () => {
    expect(normalizeRedemptionCode('k7q')).toBe('K7Q');
  });
});
