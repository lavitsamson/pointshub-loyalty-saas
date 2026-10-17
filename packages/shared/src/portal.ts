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

export const PortalRegisterSchema = z.object({
  name: PersonNameSchema,
  email: EmailSchema,
  password: PasswordSchema,
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

/**
 * Registering with an email the business already knows (the customer was enrolled at the
 * counter, or registered before) does not sign anyone in: a set-password link is emailed
 * instead, so only the owner of the address can take over the account and its points.
 */
export const PortalRegisterResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('SIGNED_IN'), me: PortalMeSchema }),
  z.object({ status: z.literal('CHECK_EMAIL') }),
]);
export type PortalRegisterResult = z.infer<typeof PortalRegisterResultSchema>;

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
