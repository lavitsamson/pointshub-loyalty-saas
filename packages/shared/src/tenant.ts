import { z } from 'zod';
import { EmailSchema, PersonNameSchema } from './auth';
import { PlanSchema, RoleSchema } from './enums';

export const TenantSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  plan: PlanSchema,
  createdAt: z.iso.datetime(),
});
export type Tenant = z.infer<typeof TenantSchema>;

export const UpdateTenantSchema = z.object({
  name: z.string().trim().min(2).max(100),
});
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;

export const MemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: RoleSchema,
  joinedAt: z.iso.datetime(),
});
export type Member = z.infer<typeof MemberSchema>;

/** Owners are created at registration; invitations grant ADMIN or STAFF only. */
export const InvitableRoleSchema = z.enum(['ADMIN', 'STAFF']);
export type InvitableRole = z.infer<typeof InvitableRoleSchema>;

export const CreateInvitationSchema = z.object({
  email: EmailSchema,
  role: InvitableRoleSchema,
});
export type CreateInvitationInput = z.infer<typeof CreateInvitationSchema>;

/**
 * Accepting an invitation either creates an account (name + new password) or, when the
 * invited email already has an account, proves ownership of it with its password.
 */
export const AcceptInvitationSchema = z.object({
  name: PersonNameSchema.optional(),
  password: z.string().min(1).max(128),
});
export type AcceptInvitationInput = z.infer<typeof AcceptInvitationSchema>;

export const UpdateMemberSchema = z.object({
  role: InvitableRoleSchema,
});
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;

export const AuditLogEntrySchema = z.object({
  id: z.string(),
  actorUserId: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export const InvitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: InvitableRoleSchema,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type Invitation = z.infer<typeof InvitationSchema>;

/**
 * What the holder of an invitation link may see before accepting: enough to show who
 * invited them, and whether to ask for a new password or their existing one.
 */
export const InvitationPreviewSchema = z.object({
  tenantName: z.string(),
  email: z.string(),
  role: InvitableRoleSchema,
  hasAccount: z.boolean(),
  expiresAt: z.iso.datetime(),
});
export type InvitationPreview = z.infer<typeof InvitationPreviewSchema>;
