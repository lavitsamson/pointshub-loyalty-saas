import { z } from 'zod';
import { EmailSchema, PasswordSchema, PersonNameSchema } from './auth';
import { RedemptionStatusSchema } from './enums';

/**
 * The customer portal at /c/:tenantSlug. Customers belong to exactly one business, so every
 * portal request names that business by its public slug.
 */

const Iso = z.iso.datetime();

/** What anyone may see about a business before signing in to its portal. */
export const PortalBusinessSchema = z.object({
  name: z.string(),
  slug: z.string(),
  currency: z.string(),
  pointsPerCurrencyUnit: z.string(),
});
export type PortalBusiness = z.infer<typeof PortalBusinessSchema>;

/**
 * Joining asks for no password: every request is answered the same way, with an emailed link
 * to choose one. For a new address the link finishes joining; for an address the business
 * already has (enrolled at the counter, or joined before) it sets that account's password.
 * Either way the response never reveals whether the address is already a customer, and only
 * the owner of the address can complete it.
 */
export const PortalRegisterSchema = z.object({
  name: PersonNameSchema,
  email: EmailSchema,
});
export type PortalRegisterInput = z.infer<typeof PortalRegisterSchema>;

export const PortalSetPasswordSchema = z.object({
  token: z.string().min(1),
  password: PasswordSchema,
});
export type PortalSetPasswordInput = z.infer<typeof PortalSetPasswordSchema>;

export const PortalTierSchema = z.object({
  id: z.string(),
  name: z.string(),
  minLifetimePoints: z.number().int(),
});
export type PortalTier = z.infer<typeof PortalTierSchema>;

export const PortalMeSchema = z.object({
  customer: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  business: z.object({ name: z.string(), slug: z.string() }),
  pointsBalance: z.number().int(),
  lifetimePoints: z.number().int(),
  tier: PortalTierSchema.nullable(),
  /** Every tier in the programme, lowest first, for showing progress to the next one. */
  tiers: z.array(PortalTierSchema),
});
export type PortalMe = z.infer<typeof PortalMeSchema>;

/** A redemption as its customer sees it. */
export const PortalRedemptionSchema = z.object({
  id: z.string(),
  code: z.string(),
  status: RedemptionStatusSchema,
  pointsSpent: z.number().int(),
  reward: z.object({ id: z.string(), name: z.string() }),
  fulfilledAt: Iso.nullable(),
  cancelledAt: Iso.nullable(),
  createdAt: Iso,
});
export type PortalRedemption = z.infer<typeof PortalRedemptionSchema>;

export const PortalRedeemSchema = z.object({ rewardId: z.uuid() });
export type PortalRedeemInput = z.infer<typeof PortalRedeemSchema>;
