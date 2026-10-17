import type { Role } from '@pointshub/shared';
import { AsyncLocalStorage } from 'node:async_hooks';

/** The business a request acts on: all the tenant-scoped Prisma client needs to know. */
export interface TenantScope {
  tenantId: string;
}

/** A merchant user acting on a business they are a member of. */
export interface TenantContext extends TenantScope {
  userId: string;
  role: Role;
}

const storage = new AsyncLocalStorage<TenantScope>();

export function runInTenantContext<T>(scope: TenantScope, fn: () => T): T {
  return storage.run(scope, fn);
}

/** The tenant of the current request, or undefined outside a tenant-scoped route. */
export function currentTenantContext(): TenantScope | undefined {
  return storage.getStore();
}
