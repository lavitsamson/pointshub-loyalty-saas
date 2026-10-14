import type { Role } from './enums';
import { can, canManageMember, Permission } from './permissions';

// The table from the product spec, written out independently of the implementation.
const expected: Array<[Permission, Record<Role, boolean>]> = [
  [Permission.RecordPurchase, { OWNER: true, ADMIN: true, STAFF: true }],
  [Permission.ViewCustomers, { OWNER: true, ADMIN: true, STAFF: true }],
  [Permission.FulfilRedemption, { OWNER: true, ADMIN: true, STAFF: true }],
  [Permission.AdjustPoints, { OWNER: true, ADMIN: true, STAFF: false }],
  [Permission.ManageProgram, { OWNER: true, ADMIN: true, STAFF: false }],
  [Permission.BulkActions, { OWNER: true, ADMIN: true, STAFF: false }],
  [Permission.ExportData, { OWNER: true, ADMIN: true, STAFF: false }],
  [Permission.ManageTeam, { OWNER: true, ADMIN: true, STAFF: false }],
  [Permission.UpdateTenant, { OWNER: true, ADMIN: true, STAFF: false }],
  [Permission.ViewAuditLog, { OWNER: true, ADMIN: true, STAFF: false }],
  [Permission.ManageBilling, { OWNER: true, ADMIN: false, STAFF: false }],
  [Permission.DeleteTenant, { OWNER: true, ADMIN: false, STAFF: false }],
  [Permission.AskAi, { OWNER: true, ADMIN: true, STAFF: false }],
];

describe('permission matrix', () => {
  it('covers every permission', () => {
    expect(expected.map(([p]) => p).sort()).toEqual(Object.values(Permission).sort());
  });

  describe.each(expected)('%s', (permission, roles) => {
    it.each(Object.entries(roles) as Array<[Role, boolean]>)('%s → %s', (role, allowed) => {
      expect(can(role, permission)).toBe(allowed);
    });
  });
});

describe('canManageMember', () => {
  it.each<[Role, Role, boolean]>([
    ['OWNER', 'OWNER', true],
    ['OWNER', 'ADMIN', true],
    ['OWNER', 'STAFF', true],
    ['ADMIN', 'OWNER', false],
    ['ADMIN', 'ADMIN', true],
    ['ADMIN', 'STAFF', true],
    ['STAFF', 'STAFF', false],
    ['STAFF', 'ADMIN', false],
  ])('%s managing %s → %s', (actor, target, allowed) => {
    expect(canManageMember(actor, target)).toBe(allowed);
  });
});
