import { Injectable } from '@nestjs/common';
import type { Prisma } from '@pointshub/db';
import type { DomainEvent } from '@pointshub/shared';
import type { EventConsumer } from '../../messaging/event-consumer';
import { statsDelta } from './stats-delta';

/**
 * Keeps DailyStats current so dashboards and the AI tools never scan the ledger. Each event
 * increments its day's row; the increment and the ProcessedEvent marker commit together,
 * so a redelivered event cannot be counted twice.
 */
@Injectable()
export class StatsConsumer implements EventConsumer {
  readonly name = 'stats';
  readonly eventTypes = [
    'customer.created',
    'points.earned',
    'points.redeemed',
    'redemption.cancelled',
  ] as const;

  async handle(event: DomainEvent, tx: Prisma.TransactionClient): Promise<void> {
    const delta = statsDelta(event);
    if (!delta) return;

    const { date, ...counts } = delta;
    const day = new Date(`${date}T00:00:00.000Z`);
    // Prisma turns this into INSERT ... ON CONFLICT DO UPDATE, which is safe under concurrency.
    await tx.dailyStats.upsert({
      where: { tenantId_date: { tenantId: event.tenantId, date: day } },
      create: { tenantId: event.tenantId, date: day, ...counts },
      update: {
        pointsEarned: { increment: counts.pointsEarned },
        pointsRedeemed: { increment: counts.pointsRedeemed },
        newCustomers: { increment: counts.newCustomers },
        purchases: { increment: counts.purchases },
        revenue: { increment: counts.revenue },
      },
    });
  }
}
