import type { PortalContext } from '../portal/portal-context';
import type { TenantContext } from '../tenancy/tenant-context';

declare global {
  namespace Express {
    interface Request {
      /** Set by AccessTokenGuard for authenticated merchant requests. */
      principal?: { userId: string };
      /** Set by TenantAccessGuard on /tenants/:tenantId routes. */
      tenantContext?: TenantContext;
      /** Set by PortalTenantGuard on /portal/:tenantSlug routes. */
      portal?: PortalContext;
    }
  }
}

export {};
