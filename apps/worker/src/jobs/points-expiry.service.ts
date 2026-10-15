import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@pointshub/db';
import { pointsDueToExpire } from '@pointshub/shared';
import { PrismaService } from '../infra/prisma.service';
import { outboxEvent } from '../outbox/outbox-writer';

export interface ExpiryResult {
  customers: number;
  points: number;
}

/**
 * Nightly write-off of expired points, FIFO.
 *
 * Follows the ledger rules from ADR 0003: one transaction per customer that locks the
 * customer row, appends an EXPIRE entry with the resulting balance, updates the cached
 * balance and writes the outbox event. What is due is recomputed from the ledger under the
 * lock, so the job is safe to re-run and cannot race a redemption at the till.
 */
@Injectable()
export class PointsExpiryService {
  private readonly logger = new Logger(PointsExpiryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async expireDue(now: Date = new Date()): Promise<ExpiryResult> {
    const result: ExpiryResult = { customers: 0, points: 0 };
    const tenants = await this.prisma.client.tenant.findMany({ select: { id: true } });

    for (const { id: tenantId } of tenants) {
      // Anyone with a lapsed lot and points left; whether anything is still unspent in
      // those lots is worked out per customer.
      const candidates = await this.prisma.client.customer.findMany({
        where: {
          tenantId,
          pointsBalance: { gt: 0 },
          ledgerEntries: { some: { tenantId, type: 'EARN', expiresAt: { lte: now } } },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
      });

      for (const { id: customerId } of candidates) {
        const expired = await this.expireCustomer(tenantId, customerId, now);
        if (expired > 0) {
          result.customers += 1;
          result.points += expired;
        }
      }
    }

    this.logger.log(`Expired ${result.points} points across ${result.customers} customers`);
    return result;
  }

  private expireCustomer(tenantId: string, customerId: string, now: Date): Promise<number> {
    return this.prisma.client.$transaction(async (tx) => {
      const [customer] = await tx.$queryRaw<Array<{ pointsBalance: number }>>`
        SELECT "pointsBalance" FROM "Customer"
        WHERE id = ${customerId}::uuid AND "tenantId" = ${tenantId}::uuid
        FOR UPDATE`;
      if (!customer) return 0;

      const movements = await this.movements(tx, tenantId, customerId);
      const due = Math.min(pointsDueToExpire(movements, now), customer.pointsBalance);
      if (due <= 0) return 0;

      const balance = customer.pointsBalance - due;
      const entry = await tx.pointsLedgerEntry.create({
        data: {
          tenantId,
          customerId,
          type: 'EXPIRE',
          points: -due,
          balanceAfter: balance,
          reason: 'Points expired',
        },
      });
      await tx.customer.update({ where: { id: customerId }, data: { pointsBalance: balance } });
      await tx.outboxEvent.create({
        data: outboxEvent(tenantId, 'points.expired', {
          customerId,
          ledgerEntryId: entry.id,
          points: -due,
          balanceAfter: balance,
        }),
      });
      return due;
    });
  }

  private movements(tx: Prisma.TransactionClient, tenantId: string, customerId: string) {
    return tx.pointsLedgerEntry.findMany({
      where: { tenantId, customerId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { points: true, expiresAt: true },
    });
  }
}
