import { Injectable } from '@nestjs/common';
import {
  type AnalyticsSummary,
  type DailyStat,
  type DailyStatsResponse,
  type DateRange,
  eachDay,
  type TopRewardsResponse,
} from '@pointshub/shared';
import { PrismaService } from '../infra/prisma.service';

const startOfDay = (date: string) => new Date(`${date}T00:00:00.000Z`);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Matches DailyStats rows for the inclusive range. */
const statsIn = ({ from, to }: DateRange) => ({
  date: { gte: startOfDay(from), lte: startOfDay(to) },
});

/**
 * Reporting for the dashboard (and, later, the AI tools). Totals come from DailyStats,
 * which the worker keeps up to date, so a dashboard load never scans the ledger. Only
 * the top-rewards ranking reads redemptions directly: it is small and indexed.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(range: DateRange): Promise<AnalyticsSummary> {
    const [totals, totalCustomers, activeRewards] = await Promise.all([
      this.prisma.scoped.dailyStats.aggregate({
        where: statsIn(range),
        _sum: {
          newCustomers: true,
          pointsEarned: true,
          pointsRedeemed: true,
          purchases: true,
          revenue: true,
        },
      }),
      this.prisma.scoped.customer.count(),
      this.prisma.scoped.reward.count({ where: { active: true } }),
    ]);
    const sum = totals._sum;

    return {
      ...range,
      totalCustomers,
      activeRewards,
      newCustomers: sum.newCustomers ?? 0,
      pointsEarned: sum.pointsEarned ?? 0,
      pointsRedeemed: sum.pointsRedeemed ?? 0,
      purchases: sum.purchases ?? 0,
      revenue: sum.revenue?.toFixed(2) ?? '0.00',
    };
  }

  async daily(range: DateRange): Promise<DailyStatsResponse> {
    const rows = await this.prisma.scoped.dailyStats.findMany({
      where: statsIn(range),
      orderBy: { date: 'asc' },
    });
    const byDate = new Map(rows.map((row) => [row.date.toISOString().slice(0, 10), row]));

    const data = eachDay(range).map((date): DailyStat => {
      const row = byDate.get(date);
      return {
        date,
        pointsEarned: row?.pointsEarned ?? 0,
        pointsRedeemed: row?.pointsRedeemed ?? 0,
        newCustomers: row?.newCustomers ?? 0,
        purchases: row?.purchases ?? 0,
        revenue: row?.revenue.toFixed(2) ?? '0.00',
      };
    });
    return { ...range, data };
  }

  /** Most redeemed rewards in the range; cancelled redemptions do not count. */
  async topRewards(range: DateRange, limit: number): Promise<TopRewardsResponse> {
    const groups = await this.prisma.scoped.redemption.groupBy({
      by: ['rewardId'],
      where: {
        status: { not: 'CANCELLED' },
        createdAt: {
          gte: startOfDay(range.from),
          lt: new Date(startOfDay(range.to).getTime() + DAY_MS),
        },
      },
      _count: { _all: true },
      _sum: { pointsSpent: true },
      orderBy: [{ _count: { rewardId: 'desc' } }, { rewardId: 'asc' }],
      take: limit,
    });

    const rewards = await this.prisma.scoped.reward.findMany({
      where: { id: { in: groups.map((g) => g.rewardId) } },
      select: { id: true, name: true },
    });
    const names = new Map(rewards.map((r) => [r.id, r.name]));

    const data = groups.map((g) => ({
      rewardId: g.rewardId,
      name: names.get(g.rewardId) ?? 'Deleted reward',
      redemptions: g._count._all,
      pointsSpent: g._sum.pointsSpent ?? 0,
    }));
    return { ...range, data };
  }
}
