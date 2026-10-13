/**
 * Points rules shared by the API (earning, tiers) and the worker (expiry).
 *
 * Money and multipliers arrive as decimal strings ("12.50", "1.25") and are computed in
 * scaled integers (BigInt), so results never suffer from binary floating-point rounding:
 * 0.1 × 3 is exactly 0.3 here.
 */

/** Parses a non-negative decimal string into an integer scaled by 10^places, e.g. ("1.25", 2) → 125n. */
export function toScaled(value: string, places: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`Not a non-negative decimal: "${value}"`);
  const [, whole, fraction = ''] = match;
  if (fraction.length > places && /[1-9]/.test(fraction.slice(places))) {
    throw new Error(`"${value}" has more than ${places} decimal places`);
  }
  return BigInt(whole! + fraction.slice(0, places).padEnd(places, '0'));
}

export interface EarnInput {
  /** Purchase amount, at most 2 decimal places. */
  amount: string;
  /** Programme rate, at most 4 decimal places. */
  pointsPerCurrencyUnit: string;
  /** Multiplier of the customer's current tier, at most 2 decimal places; "1" without a tier. */
  tierMultiplier: string;
  /** Multipliers of every campaign active at purchase time. Only the highest applies. */
  campaignMultipliers: readonly string[];
}

/** floor(amount × pointsPerCurrencyUnit × tierMultiplier × highest campaign multiplier). */
export function calculatePointsEarned(input: EarnInput): number {
  const amount = toScaled(input.amount, 2);
  const rate = toScaled(input.pointsPerCurrencyUnit, 4);
  const tier = toScaled(input.tierMultiplier, 2);
  const campaign = input.campaignMultipliers
    .map((m) => toScaled(m, 2))
    .reduce((best, m) => (m > best ? m : best), 100n);

  // Scales: amount 10^2, rate 10^4, tier 10^2, campaign 10^2 → divide by 10^10.
  // BigInt division truncates, which is floor for non-negative values.
  const points = (amount * rate * tier * campaign) / 10_000_000_000n;
  return Number(points);
}

export interface TierThreshold {
  id: string;
  minLifetimePoints: number;
}

/**
 * The highest tier whose threshold the customer has reached. Tiers never drop in v1, so the
 * current tier is kept if it is higher than what lifetime points alone would give (which can
 * happen after a merchant raises thresholds).
 */
export function tierFor<T extends TierThreshold>(
  tiers: readonly T[],
  lifetimePoints: number,
  current?: T | null,
): T | null {
  const earned = [...tiers]
    .filter((t) => t.minLifetimePoints <= lifetimePoints)
    .sort((a, b) => b.minLifetimePoints - a.minLifetimePoints)[0];
  if (!earned) return current ?? null;
  if (current && current.minLifetimePoints > earned.minLifetimePoints) return current;
  return earned;
}

export interface LedgerMovement {
  /** Signed: credits are positive, debits negative. */
  points: number;
  /** Only meaningful on credits; null means the credit never expires. */
  expiresAt: Date | null;
}

/**
 * How many points have expired by `now` and not yet been written off.
 *
 * Every credit is a lot. Debits — redemptions, negative adjustments and earlier expiry
 * write-offs — consume the oldest lots first (FIFO). Whatever remains in lots whose expiry
 * has passed is due to expire. Movements must be in chronological order.
 */
export function pointsDueToExpire(movements: readonly LedgerMovement[], now: Date): number {
  const lots: Array<{ remaining: number; expiresAt: Date | null }> = [];

  for (const movement of movements) {
    if (movement.points > 0) {
      lots.push({ remaining: movement.points, expiresAt: movement.expiresAt });
      continue;
    }
    let debit = -movement.points;
    for (const lot of lots) {
      if (debit === 0) break;
      const taken = Math.min(lot.remaining, debit);
      lot.remaining -= taken;
      debit -= taken;
    }
  }

  return lots
    .filter((lot) => lot.expiresAt !== null && lot.expiresAt <= now)
    .reduce((sum, lot) => sum + lot.remaining, 0);
}

/** Calendar months in UTC; the 31st rolls back to the last day of shorter months. */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}
