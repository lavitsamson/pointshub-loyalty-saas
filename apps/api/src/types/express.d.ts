import type { TenantContext } from '../tenancy/tenant-context';

declare global {
  namespace Express {
    interface Request {
      /** Set by AccessTokenGuard for authenticated merchant requests. */
      principal?: { userId: string };
      /** Set by TenantAccessGuard on /tenants/:tenantId routes. */
      tenantContext?: TenantContext;
    }
  }
}

export {};
