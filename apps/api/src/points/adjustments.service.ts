import { Injectable } from '@nestjs/common';
import type { AdjustPointsInput, LedgerEntry } from '@pointshub/shared';
import { AuditService } from '../audit/audit.service';
import type { RequestMeta } from '../auth/decorators';
import { PrismaService } from '../infra/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import type { TenantContext } from '../tenancy/tenant-context';
import type { ScopedTransaction } from '../tenancy/tenant-scope';
import { LedgerService } from './ledger.service';
import { toLedgerEntry } from './ledger.mapper';

@Injectable()
export class AdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async adjust(
    ctx: TenantContext,
    customerId: string,
    input: AdjustPointsInput,
    meta: RequestMeta,
  ): Promise<LedgerEntry> {
    return this.prisma.scoped.$transaction(async (tx) => {
      const entry = await this.adjustInTransaction(tx, ctx, customerId, input);
      await this.audit.record(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'points.adjusted',
        entityType: 'Customer',
        entityId: customerId,
        after: { points: input.points, reason: input.reason, balanceAfter: entry.balanceAfter },
        meta,
      });
      return entry;
    });
  }

  /** One manual adjustment, for use inside a larger transaction (e.g. a bulk action). */
  async adjustInTransaction(
    tx: ScopedTransaction,
    ctx: TenantContext,
    customerId: string,
    input: AdjustPointsInput,
  ): Promise<LedgerEntry> {
    const customer = await this.ledger.lockCustomer(tx, ctx.tenantId, customerId);
    const { entry, balance } = await this.ledger.append(tx, customer, {
      type: 'ADJUST',
      points: input.points,
      reason: input.reason,
      createdByUserId: ctx.userId,
    });
    await this.outbox.add(tx, ctx.tenantId, 'points.adjusted', {
      customerId,
      ledgerEntryId: entry.id,
      points: input.points,
      balanceAfter: balance,
      reason: input.reason,
    });
    return toLedgerEntry(entry);
  }
}
