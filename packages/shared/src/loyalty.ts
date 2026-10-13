import { z } from 'zod';
import { EmailSchema, PersonNameSchema } from './auth';
import { LedgerEntryTypeSchema, RedemptionStatusSchema } from './enums';
import { PaginationQuerySchema } from './pagination';

/**
 * A non-negative decimal sent as a string ("12.50") or number (12.5) and normalised to a
 * string, so money never passes through binary floating point on the server.
 */
export function decimalString(maxPlaces: number) {
  const pattern = new RegExp(`^\\d{1,10}(\\.\\d{1,${maxPlaces}})?$`);
  return z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
    .pipe(z.string().regex(pattern, `Must be a number with at most ${maxPlaces} decimal places`));
}

const Multiplier = decimalString(2).refine(
  (v) => Number(v) >= 1 && Number(v) <= 10,
  'Must be between 1 and 10',
);

const Iso = z.iso.datetime();

// ---------------------------------------------------------------------------
// Programme, tiers, campaigns
// ---------------------------------------------------------------------------

export const LoyaltyProgramSchema = z.object({
  pointsPerCurrencyUnit: z.string(),
  currency: z.string(),
  pointsExpiryMonths: z.number().int().nullable(),
});
export type LoyaltyProgram = z.infer<typeof LoyaltyProgramSchema>;

export const UpdateLoyaltyProgramSchema = z
  .object({
    pointsPerCurrencyUnit: decimalString(4).refine((v) => Number(v) > 0, 'Must be above 0'),
    pointsExpiryMonths: z.number().int().min(1).max(120).nullable(),
  })
  .partial();
export type UpdateLoyaltyProgramInput = z.infer<typeof UpdateLoyaltyProgramSchema>;

export const TierSchema = z.object({
  id: z.string(),
  name: z.string(),
  minLifetimePoints: z.number().int(),
  multiplier: z.string(),
  sortOrder: z.number().int(),
});
export type Tier = z.infer<typeof TierSchema>;

export const CreateTierSchema = z.object({
  name: z.string().trim().min(1).max(50),
  minLifetimePoints: z.number().int().min(0),
  multiplier: Multiplier,
  sortOrder: z.number().int().min(0),
});
export type CreateTierInput = z.infer<typeof CreateTierSchema>;
export const UpdateTierSchema = CreateTierSchema.partial();
export type UpdateTierInput = z.infer<typeof UpdateTierSchema>;

export const CampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  multiplier: z.string(),
  startsAt: Iso,
  endsAt: Iso,
  active: z.boolean(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

const CampaignFields = z.object({
  name: z.string().trim().min(1).max(100),
  multiplier: Multiplier,
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  active: z.boolean(),
});
export const CreateCampaignSchema = CampaignFields.extend({
  active: z.boolean().default(true),
}).refine((c) => c.endsAt > c.startsAt, { path: ['endsAt'], message: 'Must be after startsAt' });
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
export const UpdateCampaignSchema = CampaignFields.partial();
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;

// ---------------------------------------------------------------------------
// Customers and ledger
// ---------------------------------------------------------------------------

const TagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(30)
  .regex(/^[a-z0-9][a-z0-9 _-]*$/, 'Letters, numbers, spaces, - and _ only');

const PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{6,20}$/, 'Not a valid phone number');

export const CustomerSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  tags: z.array(z.string()),
  tier: z.object({ id: z.string(), name: z.string() }).nullable(),
  pointsBalance: z.number().int(),
  lifetimePoints: z.number().int(),
  createdAt: Iso,
});
export type Customer = z.infer<typeof CustomerSchema>;

export const CreateCustomerSchema = z.object({
  email: EmailSchema,
  name: PersonNameSchema,
  phone: PhoneSchema.optional(),
  tags: z.array(TagSchema).max(20).default([]),
});
export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;

export const UpdateCustomerSchema = z
  .object({
    email: EmailSchema,
    name: PersonNameSchema,
    phone: PhoneSchema.nullable(),
    tags: z.array(TagSchema).max(20),
  })
  .partial();
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>;

export const CustomerSortSchema = z.enum(['newest', 'name', 'points']);
export type CustomerSort = z.infer<typeof CustomerSortSchema>;

export const CustomerFilterSchema = z.object({
  /** Matches name, email or phone. */
  q: z.string().trim().min(1).max(100).optional(),
  tierId: z.uuid().optional(),
  tag: TagSchema.optional(),
  sort: CustomerSortSchema.default('newest'),
});
export const CustomerListQuerySchema = PaginationQuerySchema.extend(CustomerFilterSchema.shape);
export type CustomerListQuery = z.infer<typeof CustomerListQuerySchema>;
export type CustomerFilter = z.infer<typeof CustomerFilterSchema>;

export const LedgerEntrySchema = z.object({
  id: z.string(),
  type: LedgerEntryTypeSchema,
  points: z.number().int(),
  balanceAfter: z.number().int(),
  reason: z.string().nullable(),
  purchaseId: z.string().nullable(),
  redemptionId: z.string().nullable(),
  expiresAt: Iso.nullable(),
  createdAt: Iso,
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const BULK_MAX_CUSTOMERS = 500;

export const BulkActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('ADJUST_POINTS'),
    customerIds: z.array(z.uuid()).min(1).max(BULK_MAX_CUSTOMERS),
    params: z.object({
      points: z
        .number()
        .int()
        .refine((p) => p !== 0, 'Must not be zero'),
      reason: z.string().trim().min(3).max(200),
    }),
  }),
  z.object({
    action: z.literal('ADD_TAG'),
    customerIds: z.array(z.uuid()).min(1).max(BULK_MAX_CUSTOMERS),
    params: z.object({ tag: TagSchema }),
  }),
  z.object({
    action: z.literal('REMOVE_TAG'),
    customerIds: z.array(z.uuid()).min(1).max(BULK_MAX_CUSTOMERS),
    params: z.object({ tag: TagSchema }),
  }),
]);
export type BulkActionInput = z.infer<typeof BulkActionSchema>;

export const BulkActionResultSchema = z.object({ affected: z.number().int() });
export type BulkActionResult = z.infer<typeof BulkActionResultSchema>;

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

export const RecordPurchaseSchema = z.object({
  customerId: z.uuid(),
  amount: decimalString(2).refine((v) => Number(v) > 0, 'Must be above 0'),
  externalRef: z.string().trim().min(1).max(100).optional(),
});
export type RecordPurchaseInput = z.infer<typeof RecordPurchaseSchema>;

export const PurchaseResultSchema = z.object({
  purchase: z.object({
    id: z.string(),
    customerId: z.string(),
    amount: z.string(),
    currency: z.string(),
    externalRef: z.string().nullable(),
    createdAt: Iso,
  }),
  pointsEarned: z.number().int(),
  balance: z.number().int(),
  tier: z.object({ id: z.string(), name: z.string() }).nullable(),
  tierChanged: z.boolean(),
});
export type PurchaseResult = z.infer<typeof PurchaseResultSchema>;

export const AdjustPointsSchema = z.object({
  points: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((p) => p !== 0, 'Must not be zero'),
  reason: z.string().trim().min(3).max(200),
});
export type AdjustPointsInput = z.infer<typeof AdjustPointsSchema>;

// ---------------------------------------------------------------------------
// Rewards and redemptions
// ---------------------------------------------------------------------------

export const RewardSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  pointsCost: z.number().int(),
  stock: z.number().int().nullable(),
  active: z.boolean(),
  imageUrl: z.string().nullable(),
  createdAt: Iso,
});
export type Reward = z.infer<typeof RewardSchema>;

const RewardFields = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500),
  pointsCost: z.number().int().min(1).max(1_000_000),
  stock: z.number().int().min(0).nullable(),
  active: z.boolean(),
  imageUrl: z.url({ protocol: /^https$/ }).nullable(),
});
export const CreateRewardSchema = RewardFields.extend({
  description: RewardFields.shape.description.default(''),
  stock: RewardFields.shape.stock.default(null),
  active: z.boolean().default(true),
  imageUrl: RewardFields.shape.imageUrl.default(null),
});
export type CreateRewardInput = z.infer<typeof CreateRewardSchema>;
export const UpdateRewardSchema = RewardFields.partial();
export type UpdateRewardInput = z.infer<typeof UpdateRewardSchema>;

export const RewardListQuerySchema = PaginationQuerySchema.extend({
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type RewardListQuery = z.infer<typeof RewardListQuerySchema>;

export const RedemptionSchema = z.object({
  id: z.string(),
  code: z.string(),
  status: RedemptionStatusSchema,
  pointsSpent: z.number().int(),
  customer: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  reward: z.object({ id: z.string(), name: z.string() }),
  fulfilledAt: Iso.nullable(),
  cancelledAt: Iso.nullable(),
  createdAt: Iso,
});
export type Redemption = z.infer<typeof RedemptionSchema>;

export const CreateRedemptionSchema = z.object({
  customerId: z.uuid(),
  rewardId: z.uuid(),
});
export type CreateRedemptionInput = z.infer<typeof CreateRedemptionSchema>;

export const RedemptionListQuerySchema = PaginationQuerySchema.extend({
  status: RedemptionStatusSchema.optional(),
  /** Exact redemption code, as read out at the counter; dashes and case are ignored. */
  code: z.string().trim().min(1).max(20).optional(),
  customerId: z.uuid().optional(),
});
export type RedemptionListQuery = z.infer<typeof RedemptionListQuerySchema>;
