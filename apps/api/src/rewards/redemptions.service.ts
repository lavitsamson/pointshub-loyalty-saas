import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@pointshub/db';
import type {
  CreateRedemptionInput,
  Paginated,
  Redemption,
  RedemptionListQuery,
} from '@pointshub/shared';
import { AuditService } from '../audit/audit.service';
import type { RequestMeta } from '../auth/decorators';
import { ProblemException } from '../common/http/problem.exception';
import { afterCursor, NEWEST_FIRST, orderBy, toPage } from '../common/pagination/cursor';
import { PrismaService } from '../infra/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { LedgerService } from '../points/ledger.service';
import type { TenantContext, TenantScope } from '../tenancy/tenant-context';
import type { ScopedTransaction } from '../tenancy/tenant-scope';
import { generateRedemptionCode, normalizeRedemptionCode } from './redemption-code';

const redemptionInclude = {
  customer: { select: { id: true, name: true, email: true } },
  reward: { select: { id: true, name: true } },
} as const;

type RedemptionRow = Prisma.RedemptionGetPayload<{ include: typeof redemptionInclude }>;

const notPending = (status: string) =>
  new ProblemException({
    type: '/problems/redemption-not-pending',
    title: 'Redemption already settled',
    status: 409,
    detail: `This redemption is ${status.toLowerCase()} and can no longer change.`,
  });

/**
 * Redeeming spends points and may consume stock. Lock order is always customer, then
 * reward, so concurrent redemptions and cancellations cannot deadlock.
 */
@Injectable()
export class RedemptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  /** Staff redeem at the counter (userId set); customers redeem from the portal (no user). */
  async create(
    ctx: TenantScope & { userId?: string },
    input: CreateRedemptionInput,
  ): Promise<Redemption> {
    return this.prisma.scoped.$transaction(async (tx) => {
      const customer = await this.ledger.lockCustomer(tx, ctx.tenantId, input.customerId);
      const reward = await this.lockReward(tx, ctx.tenantId, input.rewardId);

      if (!reward.active) {
        throw new ProblemException({
          type: '/problems/reward-unavailable',
          title: 'Reward unavailable',
          status: 409,
          detail: 'This reward is not currently offered.',
        });
      }
      if (reward.stock === 0) {
        throw new ProblemException({
          type: '/problems/out-of-stock',
          title: 'Out of stock',
          status: 409,
          detail: `${reward.name} is out of stock.`,
        });
      }

      const redemption = await tx.redemption.create({
        data: {
          tenantId: ctx.tenantId,
          customerId: customer.id,
          rewardId: reward.id,
          pointsSpent: reward.pointsCost,
          code: await this.uniqueCode(tx),
        },
        include: redemptionInclude,
      });

      // Throws 409 (rolling everything back) if the balance is too low.
      const { entry, balance } = await this.ledger.append(tx, customer, {
        type: 'REDEEM',
        points: -reward.pointsCost,
        redemptionId: redemption.id,
        createdByUserId: ctx.userId,
      });

      if (reward.stock !== null) {
        await tx.reward.update({ where: { id: reward.id }, data: { stock: { decrement: 1 } } });
      }

      await this.outbox.add(tx, ctx.tenantId, 'points.redeemed', {
        customerId: customer.id,
        ledgerEntryId: entry.id,
        points: -reward.pointsCost,
        balanceAfter: balance,
        redemptionId: redemption.id,
        rewardId: reward.id,
      });
      return toRedemption(redemption);
    });
  }

  async list(query: RedemptionListQuery): Promise<Paginated<Redemption>> {
    const rows = await this.prisma.scoped.redemption.findMany({
      where: {
        ...(query.status && { status: query.status }),
        ...(query.code && { code: normalizeRedemptionCode(query.code) }),
        ...(query.customerId && { customerId: query.customerId }),
        ...afterCursor(NEWEST_FIRST, query.cursor),
      },
      orderBy: orderBy(NEWEST_FIRST),
      take: query.limit + 1,
      include: redemptionInclude,
    });
    return toPage(rows, query.limit, NEWEST_FIRST, toRedemption);
  }

  async fulfil(ctx: TenantContext, redemptionId: string): Promise<Redemption> {
    return this.prisma.scoped.$transaction(async (tx) => {
      const current = await this.find(tx, redemptionId);
      const updated = await tx.redemption.updateMany({
        where: { id: redemptionId, status: 'PENDING' },
        data: { status: 'FULFILLED', fulfilledAt: new Date() },
      });
      if (updated.count === 0) throw notPending(current.status);

      await this.outbox.add(tx, ctx.tenantId, 'redemption.fulfilled', {
        redemptionId,
        customerId: current.customerId,
        rewardId: current.rewardId,
      });
      return toRedemption(await this.find(tx, redemptionId));
    });
  }

  /** Cancelling refunds the points with a REVERSAL entry and returns the item to stock. */
  async cancel(ctx: TenantContext, redemptionId: string, meta: RequestMeta): Promise<Redemption> {
    return this.prisma.scoped.$transaction(async (tx) => {
      const current = await this.find(tx, redemptionId);
      if (current.status !== 'PENDING') throw notPending(current.status);

      const customer = await this.ledger.lockCustomer(tx, ctx.tenantId, current.customerId);
      const reward = await this.lockReward(tx, ctx.tenantId, current.rewardId);

      // Re-checked under the lock: a concurrent fulfil or cancel may have won.
      const updated = await tx.redemption.updateMany({
        where: { id: redemptionId, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      if (updated.count === 0) throw notPending((await this.find(tx, redemptionId)).status);

      await this.ledger.append(tx, customer, {
        type: 'REVERSAL',
        points: current.pointsSpent,
        redemptionId,
        reason: 'Redemption cancelled',
        createdByUserId: ctx.userId,
      });
      if (reward.stock !== null) {
        await tx.reward.update({ where: { id: reward.id }, data: { stock: { increment: 1 } } });
      }

      await this.outbox.add(tx, ctx.tenantId, 'redemption.cancelled', {
        redemptionId,
        customerId: current.customerId,
        rewardId: current.rewardId,
        pointsRefunded: current.pointsSpent,
      });
      await this.audit.record(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'redemption.cancelled',
        entityType: 'Redemption',
        entityId: redemptionId,
        before: { status: 'PENDING' },
        after: { status: 'CANCELLED', pointsRefunded: current.pointsSpent },
        meta,
      });
      return toRedemption(await this.find(tx, redemptionId));
    });
  }

  private async lockReward(tx: ScopedTransaction, tenantId: string, rewardId: string) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Reward"
      WHERE id = ${rewardId}::uuid AND "tenantId" = ${tenantId}::uuid
      FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundException('Reward not found');
    return tx.reward.findUniqueOrThrow({ where: { id: rewardId } });
  }

  private async find(tx: ScopedTransaction, redemptionId: string): Promise<RedemptionRow> {
    const row = await tx.redemption.findUnique({
      where: { id: redemptionId },
      include: redemptionInclude,
    });
    if (!row) throw new NotFoundException('Redemption not found');
    return row;
  }

  /** Collisions are vanishingly rare, but a code must be unique within the business. */
  private async uniqueCode(tx: ScopedTransaction): Promise<string> {
    for (;;) {
      const code = generateRedemptionCode();
      if (!(await tx.redemption.count({ where: { code } }))) return code;
    }
  }
}

function toRedemption(row: RedemptionRow): Redemption {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    pointsSpent: row.pointsSpent,
    customer: row.customer,
    reward: row.reward,
    fulfilledAt: row.fulfilledAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
