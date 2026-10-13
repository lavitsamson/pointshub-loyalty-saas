import { randomBytes } from 'node:crypto';

/** Deterministic PRNG (mulberry32): the same seed always produces the same demo data. */
export function createRandom(seed: number) {
  let state = seed;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability: number) => next() < probability,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    /** Picks by weight, e.g. weighted([['a', 3], ['b', 1]]) returns 'a' 75% of the time. */
    weighted: <T>(options: ReadonlyArray<readonly [T, number]>): T => {
      const total = options.reduce((sum, [, w]) => sum + w, 0);
      let roll = next() * total;
      for (const [value, weight] of options) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return options[options.length - 1]![0];
    },
  };
}
export type Random = ReturnType<typeof createRandom>;

/**
 * UUID v7 for a given moment. Seeded history is inserted in bulk, so ids are generated here
 * with the row's historical timestamp; that keeps ids time-ordered like live data.
 */
export function uuidv7(at: Date): string {
  const bytes = randomBytes(16);
  const ms = BigInt(at.getTime());
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function redemptionCode(random: Random): string {
  let raw = '';
  for (let i = 0; i < 6; i++) raw += random.pick([...CODE_ALPHABET]);
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}
