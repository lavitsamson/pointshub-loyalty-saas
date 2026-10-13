import type { Prisma, PrismaClient } from '@pointshub/db';

/**
 * Models whose rows belong to a single tenant. Membership is deliberately excluded:
 * authentication reads a user's memberships across tenants, so membership queries take
 * the tenant id explicitly instead.
 */
export const TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set<Prisma.ModelName>([
  'Customer',
  'Invitation',
  'LoyaltyProgram',
  'Tier',
  'Campaign',
  'Purchase',
  'PointsLedgerEntry',
  'Reward',
  'Redemption',
  'AuditLog',
  'OutboxEvent',
  'DailyStats',
]);

export class TenantScopeError extends Error {
  override readonly name = 'TenantScopeError';
}

type Args = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
};

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn']);

/**
 * Returns a copy of the query arguments restricted to `tenantId`: filters gain a tenantId
 * condition and created rows get the tenantId. An explicit, different tenantId is a bug
 * and throws rather than being silently overwritten.
 *
 * Nested writes (e.g. creating a ledger entry inside a customer update) are not rewritten;
 * code that uses them must set tenantId itself.
 */
export function scopeArgs(operation: string, args: Args, tenantId: string): Args {
  if (WHERE_OPERATIONS.has(operation)) {
    return { ...args, where: withTenant(args.where ?? {}, tenantId) };
  }
  if (CREATE_OPERATIONS.has(operation)) {
    const data = Array.isArray(args.data)
      ? args.data.map((row: Record<string, unknown>) => withTenant(row, tenantId))
      : withTenant((args.data ?? {}) as Record<string, unknown>, tenantId);
    return { ...args, data };
  }
  if (operation === 'upsert') {
    return {
      ...args,
      where: withTenant(args.where ?? {}, tenantId),
      create: withTenant(args.create ?? {}, tenantId),
    };
  }
  throw new TenantScopeError(`Operation "${operation}" is not supported on tenant-scoped models`);
}

function withTenant<T extends Record<string, unknown>>(input: T, tenantId: string): T {
  if ('tenant' in input) {
    throw new TenantScopeError('Set tenantId instead of connecting the tenant relation');
  }
  if (input.tenantId !== undefined && input.tenantId !== tenantId) {
    throw new TenantScopeError('Query names a different tenant than the current context');
  }
  return { ...input, tenantId };
}

/**
 * Extends a Prisma client so every query on a tenant-scoped model is restricted to the
 * tenant returned by `getTenantId`. With no tenant in context the query throws instead of
 * running unscoped. Raw SQL is not covered and must filter by tenantId explicitly.
 */
export function withTenantScope(client: PrismaClient, getTenantId: () => string | undefined) {
  return client.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!TENANT_SCOPED_MODELS.has(model)) return query(args);

          const tenantId = getTenantId();
          if (!tenantId) {
            throw new TenantScopeError(`${model}.${operation} called without a tenant context`);
          }
          return query(scopeArgs(operation, args, tenantId));
        },
      },
    },
  });
}

export type TenantScopedClient = ReturnType<typeof withTenantScope>;

/** The client passed to `prisma.scoped.$transaction(async (tx) => ...)`. */
export type ScopedTransaction = Parameters<Parameters<TenantScopedClient['$transaction']>[0]>[0];
