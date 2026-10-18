import { z } from 'zod';
import { type Plan, PlanSchema } from './enums';

export interface PlanLimits {
  /** null = unlimited. */
  maxCustomers: number | null;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: { maxCustomers: 100 },
  PRO: { maxCustomers: null },
};

/** Problem type of the 402 returned when an action needs a higher plan. */
export const PLAN_LIMIT_PROBLEM = '/problems/plan-limit';

/**
 * Subscription statuses that keep a business on Pro. `past_due` is included: Stripe is still
 * retrying the payment, and a café should not lose features over a card that expired
 * yesterday. When Stripe gives up, the status becomes `canceled` or `unpaid`.
 */
const PRO_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);

/** The plan a Stripe subscription status entitles a business to. */
export function planForSubscription(status: string | null | undefined): Plan {
  return status && PRO_STATUSES.has(status) ? 'PRO' : 'FREE';
}

export const BillingOverviewSchema = z.object({
  plan: PlanSchema,
  subscriptionStatus: z.string().nullable(),
  currentPeriodEnd: z.iso.datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  /** Whether the business has a Stripe customer, i.e. a billing portal to open. */
  hasBillingAccount: z.boolean(),
  /** False when this installation has no Stripe keys configured. */
  billingAvailable: z.boolean(),
  usage: z.object({
    customers: z.number().int(),
    customerLimit: z.number().int().nullable(),
  }),
});
export type BillingOverview = z.infer<typeof BillingOverviewSchema>;

/** A Stripe-hosted page (Checkout or the Billing Portal) to send the browser to. */
export const BillingRedirectSchema = z.object({ url: z.url() });
export type BillingRedirect = z.infer<typeof BillingRedirectSchema>;
