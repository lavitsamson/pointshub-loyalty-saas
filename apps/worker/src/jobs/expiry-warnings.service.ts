import { Injectable, Logger } from '@nestjs/common';
import { pointsExpiringBetween } from '@pointshub/shared';
import { PrismaService } from '../infra/prisma.service';
import { outboxEvent } from '../outbox/outbox-writer';

/** Customers hear about expiring points this many days ahead. */
export const WARNING_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface WarningResult {
  /** The UTC calendar day the warned-about points expire on. */
  expiresOn: string;
  customers: number;
}

/**
 * Daily scan for points that expire in exactly WARNING_DAYS days. It raises a
 * `points.expiring` event per customer; the notifications consumer turns that into an
 * email, with the same retries and deduplication as every other notification.
 *
 * Each run looks at a single calendar day of expiries, so running once a day warns about
 * every lot exactly once.
 */
@Injectable()
export class ExpiryWarningsService {
  private readonly logger = new Logger(ExpiryWarningsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async warnExpiringSoon(now: Date = new Date()): Promise<WarningResult> {
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const from = new Date(today + WARNING_DAYS * DAY_MS);
    const to = new Date(from.getTime() + DAY_MS);
    const expiresOn = from.toISOString().slice(0, 10);

    let customers = 0;
    const tenants = await this.prisma.client.tenant.findMany({ select: { id: true } });
    for (const { id: tenantId } of tenants) {
      const candidates = await this.prisma.client.customer.findMany({
        where: {
          tenantId,
          pointsBalance: { gt: 0 },
          ledgerEntries: { some: { tenantId, type: 'EARN', expiresAt: { gte: from, lt: to } } },
        },
        select: { id: true },
      });

      const events = [];
      for (const { id: customerId } of candidates) {
        const movements = await this.prisma.client.pointsLedgerEntry.findMany({
          where: { tenantId, customerId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { points: true, expiresAt: true },
        });
        // Lots that were already spent (FIFO) are nothing to warn about.
        const points = pointsExpiringBetween(movements, from, to);
        if (points > 0) {
          events.push(outboxEvent(tenantId, 'points.expiring', { customerId, points, expiresOn }));
        }
      }

      if (events.length > 0) await this.prisma.client.outboxEvent.createMany({ data: events });
      customers += events.length;
    }

    this.logger.log(`Warned ${customers} customers about points expiring on ${expiresOn}`);
    return { expiresOn, customers };
  }
}
