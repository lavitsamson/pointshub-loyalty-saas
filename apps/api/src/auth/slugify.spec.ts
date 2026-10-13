import { slugify } from './auth.service';

describe('slugify', () => {
  it.each([
    ['Bean & Brew Café', 'bean-and-brew-cafe'],
    ['  Studio Bloom Salon!! ', 'studio-bloom-salon'],
    ['Ünïcödé Bäkery', 'unicode-bakery'],
    ['***', 'business'],
  ])('%s → %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('caps the length without leaving a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(47)} b`);
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith('-')).toBe(false);
  });
});
