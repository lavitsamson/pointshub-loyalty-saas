import type { Role } from '@pointshub/shared';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: Role;
}

const storage = new AsyncLocalStorage<TenantContext>();

export function runInTenantContext<T>(context: TenantContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** The tenant of the current request, or undefined outside a tenant-scoped route. */
export function currentTenantContext(): TenantContext | undefined {
  return storage.getStore();
}
