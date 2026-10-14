/**
 * Query keys. Everything about a business sits under ['tenants', tenantId], so a mutation
 * can invalidate one area (e.g. all customer queries) with a single prefix.
 */
export const keys = {
  me: ['me'] as const,
  invitation: (token: string) => ['invitation', token] as const,

  tenant: (tenantId: string) => ['tenants', tenantId] as const,
  area: (tenantId: string, area: Area) => ['tenants', tenantId, area] as const,
  list: (tenantId: string, area: Area, params: object = {}) =>
    ['tenants', tenantId, area, 'list', params] as const,
  item: (tenantId: string, area: Area, id: string) =>
    ['tenants', tenantId, area, 'item', id] as const,
};

export type Area =
  | 'program'
  | 'tiers'
  | 'campaigns'
  | 'customers'
  | 'rewards'
  | 'redemptions'
  | 'analytics'
  | 'members'
  | 'invitations'
  | 'audit';
