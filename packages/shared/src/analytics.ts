import { z } from 'zod';

/** Longest range a report may cover, so a single request stays cheap. */
export const MAX_REPORT_DAYS = 366;
export const DEFAULT_REPORT_DAYS = 30;
export const MAX_TOP_REWARDS = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to`, inclusive. Both are `YYYY-MM-DD` (UTC calendar days). */
export function daysInRange(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
}

const DateRangeFields = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

function checkRange<T extends z.ZodType<{ from?: string; to?: string }>>(schema: T) {
  return schema
    .refine((r) => !r.from || !r.to || r.from <= r.to, {
      path: ['to'],
      message: 'Must not be before from',
    })
    .refine((r) => !r.from || !r.to || daysInRange(r.from, r.to) <= MAX_REPORT_DAYS, {
      path: ['from'],
      message: `Range must not exceed ${MAX_REPORT_DAYS} days`,
    });
}

/**
 * `?from=&to=` as UTC calendar dates, both inclusive. Either may be omitted: the server
 * fills in the last 30 days ending today.
 */
export const DateRangeQuerySchema = checkRange(DateRangeFields);
export type DateRangeQuery = z.infer<typeof DateRangeQuerySchema>;

export interface DateRange {
  from: string;
  to: string;
}

const shiftDays = (date: string, days: number) =>
  new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * Resolves an optional range to concrete dates. With neither end given it is the 30 days
 * ending `today`; with one end given it is the 30 days starting or ending there.
 */
export function resolveDateRange(query: DateRangeQuery, today: Date = new Date()): DateRange {
  const span = DEFAULT_REPORT_DAYS - 1;
  if (query.from && query.to) return { from: query.from, to: query.to };
  if (query.from) return { from: query.from, to: shiftDays(query.from, span) };
  const to = query.to ?? today.toISOString().slice(0, 10);
  return { from: shiftDays(to, -span), to };
}

/** Every date in the range, oldest first. */
export function eachDay({ from, to }: DateRange): string[] {
  return Array.from({ length: daysInRange(from, to) }, (_, i) => shiftDays(from, i));
}

export const TopRewardsQuerySchema = checkRange(
  DateRangeFields.extend({
    limit: z.coerce.number().int().min(1).max(MAX_TOP_REWARDS).default(5),
  }),
);
export type TopRewardsQuery = z.infer<typeof TopRewardsQuerySchema>;

export const AnalyticsSummarySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  /** Point-in-time figures, not limited to the range. */
  totalCustomers: z.number().int(),
  activeRewards: z.number().int(),
  /** Totals over the range. */
  newCustomers: z.number().int(),
  pointsEarned: z.number().int(),
  pointsRedeemed: z.number().int(),
  purchases: z.number().int(),
  revenue: z.string(),
});
export type AnalyticsSummary = z.infer<typeof AnalyticsSummarySchema>;

export const DailyStatSchema = z.object({
  date: z.iso.date(),
  pointsEarned: z.number().int(),
  pointsRedeemed: z.number().int(),
  newCustomers: z.number().int(),
  purchases: z.number().int(),
  revenue: z.string(),
});
export type DailyStat = z.infer<typeof DailyStatSchema>;

/** One row per day in the range, oldest first; days without activity are zero-filled. */
export const DailyStatsResponseSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  data: z.array(DailyStatSchema),
});
export type DailyStatsResponse = z.infer<typeof DailyStatsResponseSchema>;

export const TopRewardSchema = z.object({
  rewardId: z.string(),
  name: z.string(),
  redemptions: z.number().int(),
  pointsSpent: z.number().int(),
});
export type TopReward = z.infer<typeof TopRewardSchema>;

export const TopRewardsResponseSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  data: z.array(TopRewardSchema),
});
export type TopRewardsResponse = z.infer<typeof TopRewardsResponseSchema>;
