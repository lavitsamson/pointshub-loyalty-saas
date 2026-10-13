import { z } from 'zod';

export const PlanSchema = z.enum(['FREE', 'PRO']);
export type Plan = z.infer<typeof PlanSchema>;

export const RoleSchema = z.enum(['OWNER', 'ADMIN', 'STAFF']);
export type Role = z.infer<typeof RoleSchema>;

export const LedgerEntryTypeSchema = z.enum(['EARN', 'REDEEM', 'EXPIRE', 'ADJUST', 'REVERSAL']);
export type LedgerEntryType = z.infer<typeof LedgerEntryTypeSchema>;

export const RedemptionStatusSchema = z.enum(['PENDING', 'FULFILLED', 'CANCELLED']);
export type RedemptionStatus = z.infer<typeof RedemptionStatusSchema>;
