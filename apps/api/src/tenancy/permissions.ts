import type { Role } from '@pointshub/shared';

/** Everything a member can do inside a tenant. Checked by the tenant guard via @RequirePermission. */
export const Permission = {
  RecordPurchase: 'RECORD_PURCHASE',
  ViewCustomers: 'VIEW_CUSTOMERS',
  FulfilRedemption: 'FULFIL_REDEMPTION',
  AdjustPoints: 'ADJUST_POINTS',
  ManageProgram: 'MANAGE_PROGRAM',
  BulkActions: 'BULK_ACTIONS',
  ExportData: 'EXPORT_DATA',
  ManageTeam: 'MANAGE_TEAM',
  UpdateTenant: 'UPDATE_TENANT',
  ViewAuditLog: 'VIEW_AUDIT_LOG',
  ManageBilling: 'MANAGE_BILLING',
  DeleteTenant: 'DELETE_TENANT',
  AskAi: 'ASK_AI',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const ALL_ROLES: readonly Role[] = ['OWNER', 'ADMIN', 'STAFF'];
const MANAGERS: readonly Role[] = ['OWNER', 'ADMIN'];
const OWNER_ONLY: readonly Role[] = ['OWNER'];

const MATRIX: Record<Permission, readonly Role[]> = {
  RECORD_PURCHASE: ALL_ROLES,
  VIEW_CUSTOMERS: ALL_ROLES,
  FULFIL_REDEMPTION: ALL_ROLES,
  ADJUST_POINTS: MANAGERS,
  MANAGE_PROGRAM: MANAGERS,
  BULK_ACTIONS: MANAGERS,
  EXPORT_DATA: MANAGERS,
  MANAGE_TEAM: MANAGERS,
  UPDATE_TENANT: MANAGERS,
  VIEW_AUDIT_LOG: MANAGERS,
  MANAGE_BILLING: OWNER_ONLY,
  DELETE_TENANT: OWNER_ONLY,
  ASK_AI: MANAGERS,
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[permission].includes(role);
}

/**
 * Team management is relative to the target: admins manage staff and other admins,
 * but only an owner may change or remove an owner.
 */
export function canManageMember(actor: Role, target: Role): boolean {
  if (!can(actor, Permission.ManageTeam)) return false;
  return target !== 'OWNER' || actor === 'OWNER';
}
