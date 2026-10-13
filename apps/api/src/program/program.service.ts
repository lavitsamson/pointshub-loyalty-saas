import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  Campaign as CampaignRow,
  LoyaltyProgram as ProgramRow,
  Tier as TierRow,
} from '@pointshub/db';
import type {
  Campaign,
  CreateCampaignInput,
  CreateTierInput,
  LoyaltyProgram,
  Paginated,
  PaginationQuery,
  Tier,
  UpdateCampaignInput,
  UpdateLoyaltyProgramInput,
  UpdateTierInput,
} from '@pointshub/shared';
import { AuditService } from '../audit/audit.service';
import type { RequestMeta } from '../auth/decorators';
import { ProblemException } from '../common/http/problem.exception';
import {
  afterCursor,
  type Keyset,
  NEWEST_FIRST,
  orderBy,
  toPage,
} from '../common/pagination/cursor';
import { isRecordNotFound, isUniqueViolation } from '../common/prisma-errors';
import { PrismaService } from '../infra/prisma.service';
import type { TenantContext } from '../tenancy/tenant-context';

const TIERS_BY_THRESHOLD: Keyset<TierRow> = {
  name: 'threshold',
  field: 'minLifetimePoints',
  direction: 'asc',
  valueOf: (tier) => tier.minLifetimePoints,
};

/**
 * Programme settings, tiers and campaigns. Changes apply to future movements only: editing
 * a tier threshold does not retro-actively move customers (tiers are re-evaluated when a
 * customer next earns, and never drop).
 */
@Injectable()
export class ProgramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Programme -------------------------------------------------------------

  async getProgram(): Promise<LoyaltyProgram> {
    return toProgram(await this.prisma.scoped.loyaltyProgram.findFirstOrThrow());
  }

  async updateProgram(
    ctx: TenantContext,
    input: UpdateLoyaltyProgramInput,
    meta: RequestMeta,
  ): Promise<LoyaltyProgram> {
    return this.prisma.scoped.$transaction(async (tx) => {
      const before = await tx.loyaltyProgram.findFirstOrThrow();
      const after = await tx.loyaltyProgram.update({ where: { id: before.id }, data: input });
      await this.record(tx, ctx, meta, 'program.updated', 'LoyaltyProgram', before.id, {
        before: toProgram(before),
        after: toProgram(after),
      });
      return toProgram(after);
    });
  }

  // --- Tiers -------------------------------------------------------------------

  async listTiers(query: PaginationQuery): Promise<Paginated<Tier>> {
    const rows = await this.prisma.scoped.tier.findMany({
      where: afterCursor(TIERS_BY_THRESHOLD, query.cursor),
      orderBy: orderBy(TIERS_BY_THRESHOLD),
      take: query.limit + 1,
    });
    return toPage(rows, query.limit, TIERS_BY_THRESHOLD, toTier);
  }

  async createTier(ctx: TenantContext, input: CreateTierInput, meta: RequestMeta): Promise<Tier> {
    return this.uniqueTierName(() =>
      this.prisma.scoped.$transaction(async (tx) => {
        const tier = await tx.tier.create({ data: { ...input, tenantId: ctx.tenantId } });
        await this.record(tx, ctx, meta, 'tier.created', 'Tier', tier.id, { after: toTier(tier) });
        return toTier(tier);
      }),
    );
  }

  async updateTier(
    ctx: TenantContext,
    tierId: string,
    input: UpdateTierInput,
    meta: RequestMeta,
  ): Promise<Tier> {
    return this.uniqueTierName(() =>
      this.prisma.scoped.$transaction(async (tx) => {
        const before = await this.findOr404(tx.tier.findUnique({ where: { id: tierId } }), 'Tier');
        const after = await tx.tier.update({ where: { id: tierId }, data: input });
        await this.record(tx, ctx, meta, 'tier.updated', 'Tier', tierId, {
          before: toTier(before),
          after: toTier(after),
        });
        return toTier(after);
      }),
    );
  }

  /** Customers in a deleted tier keep their points; their tier is re-evaluated on next earn. */
  async deleteTier(ctx: TenantContext, tierId: string, meta: RequestMeta): Promise<void> {
    await this.prisma.scoped.$transaction(async (tx) => {
      const before = await this.findOr404(tx.tier.findUnique({ where: { id: tierId } }), 'Tier');
      await tx.tier.delete({ where: { id: tierId } });
      await this.record(tx, ctx, meta, 'tier.deleted', 'Tier', tierId, { before: toTier(before) });
    });
  }

  // --- Campaigns ---------------------------------------------------------------

  async listCampaigns(query: PaginationQuery): Promise<Paginated<Campaign>> {
    const rows = await this.prisma.scoped.campaign.findMany({
      where: afterCursor(NEWEST_FIRST, query.cursor),
      orderBy: orderBy(NEWEST_FIRST),
      take: query.limit + 1,
    });
    return toPage(rows, query.limit, NEWEST_FIRST, toCampaign);
  }

  async createCampaign(
    ctx: TenantContext,
    input: CreateCampaignInput,
    meta: RequestMeta,
  ): Promise<Campaign> {
    return this.prisma.scoped.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({ data: { ...input, tenantId: ctx.tenantId } });
      await this.record(tx, ctx, meta, 'campaign.created', 'Campaign', campaign.id, {
        after: toCampaign(campaign),
      });
      return toCampaign(campaign);
    });
  }

  async updateCampaign(
    ctx: TenantContext,
    campaignId: string,
    input: UpdateCampaignInput,
    meta: RequestMeta,
  ): Promise<Campaign> {
    return this.prisma.scoped.$transaction(async (tx) => {
      const before = await this.findOr404(
        tx.campaign.findUnique({ where: { id: campaignId } }),
        'Campaign',
      );
      const startsAt = input.startsAt ?? before.startsAt;
      const endsAt = input.endsAt ?? before.endsAt;
      if (endsAt <= startsAt) {
        throw ProblemException.validation([{ path: 'endsAt', message: 'Must be after startsAt' }]);
      }
      const after = await tx.campaign.update({ where: { id: campaignId }, data: input });
      await this.record(tx, ctx, meta, 'campaign.updated', 'Campaign', campaignId, {
        before: toCampaign(before),
        after: toCampaign(after),
      });
      return toCampaign(after);
    });
  }

  async deleteCampaign(ctx: TenantContext, campaignId: string, meta: RequestMeta): Promise<void> {
    await this.prisma.scoped.$transaction(async (tx) => {
      const before = await this.findOr404(
        tx.campaign.findUnique({ where: { id: campaignId } }),
        'Campaign',
      );
      await tx.campaign.delete({ where: { id: campaignId } });
      await this.record(tx, ctx, meta, 'campaign.deleted', 'Campaign', campaignId, {
        before: toCampaign(before),
      });
    });
  }

  // --- Helpers -------------------------------------------------------------------

  private async findOr404<T>(query: PromiseLike<T | null>, resource: string): Promise<T> {
    const row = await query;
    if (!row) throw new NotFoundException(`${resource} not found`);
    return row;
  }

  private async uniqueTierName<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProblemException({
          type: '/problems/duplicate-tier',
          title: 'Tier name already used',
          status: 409,
          detail: 'Each tier needs a distinct name.',
        });
      }
      if (isRecordNotFound(error)) throw new NotFoundException('Tier not found');
      throw error;
    }
  }

  private record(
    tx: Parameters<AuditService['record']>[0],
    ctx: TenantContext,
    meta: RequestMeta,
    action: string,
    entityType: string,
    entityId: string,
    change: { before?: object; after?: object },
  ) {
    return this.audit.record(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action,
      entityType,
      entityId,
      before: change.before,
      after: change.after,
      meta,
    });
  }
}

function toProgram(row: ProgramRow): LoyaltyProgram {
  return {
    pointsPerCurrencyUnit: row.pointsPerCurrencyUnit.toString(),
    currency: row.currency,
    pointsExpiryMonths: row.pointsExpiryMonths,
  };
}

export function toTier(row: TierRow): Tier {
  return {
    id: row.id,
    name: row.name,
    minLifetimePoints: row.minLifetimePoints,
    multiplier: row.multiplier.toFixed(2),
    sortOrder: row.sortOrder,
  };
}

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    multiplier: row.multiplier.toFixed(2),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    active: row.active,
  };
}
