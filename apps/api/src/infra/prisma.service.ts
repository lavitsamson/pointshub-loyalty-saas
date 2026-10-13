import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@pointshub/db';
import { ENV, type Env } from '../config/env';
import { currentTenantContext } from '../tenancy/tenant-context';
import { type TenantScopedClient, withTenantScope } from '../tenancy/tenant-scope';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  /**
   * Default client for request handling: queries on tenant-owned models are restricted to
   * the tenant of the current request and throw outside a tenant-scoped route.
   */
  readonly scoped: TenantScopedClient;

  /**
   * Bypasses tenant scoping. For work that is legitimately cross-tenant or happens before a
   * tenant is known: authentication, registration, invitations, health checks.
   */
  readonly unscoped: PrismaClient;

  constructor(@Inject(ENV) env: Env) {
    this.unscoped = createPrismaClient({ connectionString: env.DATABASE_URL });
    this.scoped = withTenantScope(this.unscoped, () => currentTenantContext()?.tenantId);
  }

  async ping(): Promise<void> {
    await this.unscoped.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.unscoped.$disconnect();
  }
}
