import { Injectable, NotFoundException } from '@nestjs/common';
import type { Tenant as TenantRow } from '@pointshub/db';
import type { Tenant, UpdateTenantInput } from '@pointshub/shared';
import { AuditService } from '../audit/audit.service';
import type { RequestMeta } from '../auth/decorators';
import { PrismaService } from '../infra/prisma.service';
import type { TenantContext } from '../tenancy/tenant-context';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(tenantId: string): Promise<Tenant> {
    const tenant = await this.prisma.unscoped.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return toTenant(tenant);
  }

  async update(ctx: TenantContext, input: UpdateTenantInput, meta: RequestMeta): Promise<Tenant> {
    const updated = await this.prisma.unscoped.$transaction(async (tx) => {
      const before = await tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
      const after = await tx.tenant.update({ where: { id: ctx.tenantId }, data: input });
      await this.audit.record(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'tenant.updated',
        entityType: 'Tenant',
        entityId: ctx.tenantId,
        before: { name: before.name },
        after: { name: after.name },
        meta,
      });
      return after;
    });
    return toTenant(updated);
  }
}

function toTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    createdAt: row.createdAt.toISOString(),
  };
}
