import type { Customer as CustomerRow, Prisma, Tier } from '@pointshub/db';
import type { Customer, CustomerFilter, CustomerSort } from '@pointshub/shared';
import type { Keyset } from '../common/pagination/cursor';

type Row = CustomerRow;

/** One keyset per sort option of the customer list. */
export const CUSTOMER_KEYSETS: Record<CustomerSort, Keyset<Row>> = {
  newest: { name: 'newest', field: 'createdAt', direction: 'desc', valueOf: (c) => c.createdAt },
  name: { name: 'name', field: 'name', direction: 'asc', valueOf: (c) => c.name },
  points: {
    name: 'points',
    field: 'pointsBalance',
    direction: 'desc',
    valueOf: (c) => c.pointsBalance,
  },
};

/** Translates list filters into a Prisma `where`. The tenant filter is added by the scoped client. */
export function customerWhere(filter: CustomerFilter): Prisma.CustomerWhereInput {
  const conditions: Prisma.CustomerWhereInput[] = [];
  if (filter.q) {
    conditions.push({
      OR: [
        { name: { contains: filter.q, mode: 'insensitive' } },
        { email: { contains: filter.q, mode: 'insensitive' } },
        { phone: { contains: filter.q } },
      ],
    });
  }
  if (filter.tierId) conditions.push({ currentTierId: filter.tierId });
  if (filter.tag) conditions.push({ tags: { has: filter.tag } });
  return { AND: conditions };
}

export const customerInclude = {
  currentTier: { select: { id: true, name: true } },
} as const;

export function toCustomer(
  row: CustomerRow & { currentTier: Pick<Tier, 'id' | 'name'> | null },
): Customer {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    tags: row.tags,
    tier: row.currentTier,
    pointsBalance: row.pointsBalance,
    lifetimePoints: row.lifetimePoints,
    createdAt: row.createdAt.toISOString(),
  };
}
