import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { canManageMember } from '@pointshub/shared';
import type { InvitableRole, Member, Paginated, PaginationQuery } from '@pointshub/shared';
import { AuditService } from '../audit/audit.service';
import type { RequestMeta } from '../auth/decorators';
import { ProblemException } from '../common/http/problem.exception';
import { afterCursor, NEWEST_FIRST, orderBy, toPage } from '../common/pagination/cursor';
import { PrismaService } from '../infra/prisma.service';
import type { TenantContext } from '../tenancy/tenant-context';

const memberSelect = {
  id: true,
  role: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} as const;

/**
 * Memberships are read cross-tenant during authentication, so they are not covered by the
 * tenant-scoped client; every query here filters by ctx.tenantId explicitly.
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext, query: PaginationQuery): Promise<Paginated<Member>> {
    const rows = await this.prisma.unscoped.membership.findMany({
      where: { tenantId: ctx.tenantId, ...afterCursor(NEWEST_FIRST, query.cursor) },
      orderBy: orderBy(NEWEST_FIRST),
      take: query.limit + 1,
      select: memberSelect,
    });
    return toPage(rows, query.limit, NEWEST_FIRST, (row) => ({
      userId: row.user.id,
      name: row.user.name,
      email: row.user.email,
      role: row.role,
      joinedAt: row.createdAt.toISOString(),
    }));
  }

  async changeRole(
    ctx: TenantContext,
    userId: string,
    role: InvitableRole,
    meta: RequestMeta,
  ): Promise<Member> {
    return this.prisma.unscoped.$transaction(async (tx) => {
      const target = await this.findMember(tx, ctx.tenantId, userId);
      this.assertCanManage(ctx, target.role);
      if (target.role === 'OWNER') await this.assertAnotherOwner(tx, ctx.tenantId, userId);

      const updated = await tx.membership.update({
        where: { id: target.id },
        data: { role },
        select: memberSelect,
      });
      await this.audit.record(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'member.role_changed',
        entityType: 'Membership',
        entityId: target.id,
        before: { userId, role: target.role },
        after: { userId, role },
        meta,
      });
      return {
        userId: updated.user.id,
        name: updated.user.name,
        email: updated.user.email,
        role: updated.role,
        joinedAt: updated.createdAt.toISOString(),
      };
    });
  }

  async remove(ctx: TenantContext, userId: string, meta: RequestMeta): Promise<void> {
    await this.prisma.unscoped.$transaction(async (tx) => {
      const target = await this.findMember(tx, ctx.tenantId, userId);
      // Leaving a business yourself is allowed regardless of role, as long as an owner remains.
      if (userId !== ctx.userId) this.assertCanManage(ctx, target.role);
      if (target.role === 'OWNER') await this.assertAnotherOwner(tx, ctx.tenantId, userId);

      await tx.membership.delete({ where: { id: target.id } });
      await this.audit.record(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'member.removed',
        entityType: 'Membership',
        entityId: target.id,
        before: { userId, role: target.role },
        meta,
      });
    });
  }

  private async findMember(tx: Tx, tenantId: string, userId: string) {
    const member = await tx.membership.findFirst({
      where: { tenantId, userId },
      select: { id: true, role: true },
    });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  private assertCanManage(ctx: TenantContext, targetRole: Member['role']): void {
    if (!canManageMember(ctx.role, targetRole)) {
      throw new ForbiddenException('Your role does not allow managing this member');
    }
  }

  /** A business must always keep at least one owner. */
  private async assertAnotherOwner(tx: Tx, tenantId: string, exceptUserId: string) {
    const owners = await tx.membership.count({
      where: { tenantId, role: 'OWNER', userId: { not: exceptUserId } },
    });
    if (owners === 0) {
      throw new ProblemException({
        type: '/problems/last-owner',
        title: 'A business needs an owner',
        status: 409,
        detail: 'Make someone else an owner before changing or removing the last one.',
      });
    }
  }
}

type Tx = Parameters<Parameters<PrismaService['unscoped']['$transaction']>[0]>[0];
