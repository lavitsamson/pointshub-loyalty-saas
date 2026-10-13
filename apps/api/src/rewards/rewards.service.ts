import { Injectable, NotFoundException } from '@nestjs/common';
import type { Reward as RewardRow } from '@pointshub/db';
import type {
  CreateRewardInput,
  Paginated,
  Reward,
  RewardListQuery,
  UpdateRewardInput,
} from '@pointshub/shared';
import { AuditService } from '../audit/audit.service';
import type { RequestMeta } from '../auth/decorators';
import { ProblemException } from '../common/http/problem.exception';
import { afterCursor, NEWEST_FIRST, orderBy, toPage } from '../common/pagination/cursor';
import { PrismaService } from '../infra/prisma.service';
import type { TenantContext } from '../tenancy/tenant-context';

@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: RewardListQuery): Promise<Paginated<Reward>> {
    const rows = await this.prisma.scoped.reward.findMany({
      where: {
        ...(query.active === undefined ? {} : { active: query.active }),
        ...afterCursor(NEWEST_FIRST, query.cursor),
      },
      orderBy: orderBy(NEWEST_FIRST),
      take: query.limit + 1,
    });
    return toPage(rows, query.limit, NEWEST_FIRST, toReward);
  }

  async get(rewardId: string): Promise<Reward> {
    const row = await this.prisma.scoped.reward.findUnique({ where: { id: rewardId } });
    if (!row) throw new NotFoundException('Reward not found');
    return toReward(row);
  }

  async create(ctx: TenantContext, input: CreateRewardInput, meta: RequestMeta): Promise<Reward> {
    return this.prisma.scoped.$transaction(async (tx) => {
      const row = await tx.reward.create({ data: { ...input, tenantId: ctx.tenantId } });
      await this.audit.record(tx, {
        ...base(ctx, meta, 'reward.created', row.id),
        after: toReward(row),
      });
      return toReward(row);
    });
  }

  async update(
    ctx: TenantContext,
    rewardId: string,
    input: UpdateRewardInput,
    meta: RequestMeta,
  ): Promise<Reward> {
    return this.prisma.scoped.$transaction(async (tx) => {
      const before = await tx.reward.findUnique({ where: { id: rewardId } });
      if (!before) throw new NotFoundException('Reward not found');
      const after = await tx.reward.update({ where: { id: rewardId }, data: input });
      await this.audit.record(tx, {
        ...base(ctx, meta, 'reward.updated', rewardId),
        before: toReward(before),
        after: toReward(after),
      });
      return toReward(after);
    });
  }

  /**
   * Rewards that have been redeemed are part of customers' history and cannot be deleted;
   * deactivate them instead.
   */
  async remove(ctx: TenantContext, rewardId: string, meta: RequestMeta): Promise<void> {
    await this.prisma.scoped.$transaction(async (tx) => {
      const before = await tx.reward.findUnique({ where: { id: rewardId } });
      if (!before) throw new NotFoundException('Reward not found');
      if (await tx.redemption.count({ where: { rewardId } })) {
        throw new ProblemException({
          type: '/problems/reward-in-use',
          title: 'Reward has redemptions',
          status: 409,
          detail: 'This reward has been redeemed before. Deactivate it instead of deleting it.',
        });
      }
      await tx.reward.delete({ where: { id: rewardId } });
      await this.audit.record(tx, {
        ...base(ctx, meta, 'reward.deleted', rewardId),
        before: toReward(before),
      });
    });
  }
}

function base(ctx: TenantContext, meta: RequestMeta, action: string, entityId: string) {
  return {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action,
    entityType: 'Reward',
    entityId,
    meta,
  };
}

export function toReward(row: RewardRow): Reward {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    pointsCost: row.pointsCost,
    stock: row.stock,
    active: row.active,
    imageUrl: row.imageUrl,
    createdAt: row.createdAt.toISOString(),
  };
}
