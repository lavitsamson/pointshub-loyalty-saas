import { addMonths, calculatePointsEarned, tierFor } from '@pointshub/shared';
import type { Prisma } from '../../src';
import {
  type DemoTenant,
  FIRST_NAMES,
  HISTORY_DAYS,
  LAST_NAMES,
  type VisitPattern,
} from './demo-data';
import { type Random, redemptionCode, uuidv7 } from './random';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SeedTier {
  id: string;
  name: string;
  minLifetimePoints: number;
  multiplier: string;
}

export interface SeedReward {
  id: string;
  pointsCost: number;
  /** Limited-stock rewards are left out of simulated history. */
  stock: number | null;
}

export interface Campaign {
  multiplier: string;
  startsAt: Date;
  endsAt: Date;
}

export interface HistoryInput {
  tenant: DemoTenant;
  tenantId: string;
  tiers: SeedTier[];
  rewards: SeedReward[];
  pastCampaigns: Campaign[];
  staffUserIds: string[];
  portalPasswordHash: string;
  now: Date;
  random: Random;
}

export interface History {
  customers: Prisma.CustomerCreateManyInput[];
  purchases: Prisma.PurchaseCreateManyInput[];
  ledger: Prisma.PointsLedgerEntryCreateManyInput[];
  redemptions: Prisma.RedemptionCreateManyInput[];
  dailyStats: Prisma.DailyStatsCreateManyInput[];
}

interface CustomerPlan {
  name: string;
  email: string;
  joinedAt: Date;
  pattern: VisitPattern;
  /** Lapsed customers stopped visiting on this date. */
  lastVisitBy: Date;
  passwordHash?: string;
}

/**
 * Simulates six months of trading for one business, applying the same earning and tier
 * rules as the API so the demo data is internally consistent: balances equal the sum of
 * ledger entries, and tiers match lifetime points.
 */
export function simulateHistory(input: HistoryInput): History {
  const { tenant, tenantId, tiers, now, random } = input;
  const history: History = {
    customers: [],
    purchases: [],
    ledger: [],
    redemptions: [],
    dailyStats: [],
  };
  const affordable = input.rewards.filter((r) => r.stock === null);
  const usedCodes = new Set<string>();

  for (const plan of planCustomers(tenant, input.portalPasswordHash, now, random)) {
    const customerId = uuidv7(plan.joinedAt);
    let balance = 0;
    let lifetime = 0;
    let tier = tierFor(tiers, 0);

    for (const visitAt of visitTimes(tenant, plan, now, random)) {
      const amount = (random.int(tenant.basket.min * 100, tenant.basket.max * 100) / 100).toFixed(
        2,
      );
      const points = calculatePointsEarned({
        amount,
        pointsPerCurrencyUnit: tenant.pointsPerCurrencyUnit,
        tierMultiplier: tier?.multiplier ?? '1',
        campaignMultipliers: input.pastCampaigns
          .filter((c) => c.startsAt <= visitAt && visitAt < c.endsAt)
          .map((c) => c.multiplier),
      });

      const purchaseId = uuidv7(visitAt);
      history.purchases.push({
        id: purchaseId,
        tenantId,
        customerId,
        amount,
        currency: tenant.currency,
        recordedByUserId: random.pick(input.staffUserIds),
        idempotencyKey: `seed-${purchaseId}`,
        createdAt: visitAt,
      });

      balance += points;
      lifetime += points;
      history.ledger.push({
        id: uuidv7(visitAt),
        tenantId,
        customerId,
        type: 'EARN',
        points,
        balanceAfter: balance,
        purchaseId,
        expiresAt: tenant.pointsExpiryMonths ? addMonths(visitAt, tenant.pointsExpiryMonths) : null,
        createdAt: visitAt,
      });
      tier = tierFor(tiers, lifetime, tier);

      // Regulars cash in now and then, mostly at the counter straight away.
      const options = affordable.filter((r) => r.pointsCost <= balance);
      if (options.length > 0 && random.chance(0.12)) {
        const reward = random.pick(options);
        const at = new Date(visitAt.getTime() + 60_000);
        const redemptionId = uuidv7(at);
        const ageDays = (now.getTime() - at.getTime()) / DAY_MS;
        const status =
          ageDays < 3 && random.chance(0.6)
            ? 'PENDING'
            : random.chance(0.04)
              ? 'CANCELLED'
              : 'FULFILLED';

        let code = redemptionCode(random);
        while (usedCodes.has(code)) code = redemptionCode(random);
        usedCodes.add(code);

        history.redemptions.push({
          id: redemptionId,
          tenantId,
          customerId,
          rewardId: reward.id,
          pointsSpent: reward.pointsCost,
          status,
          code,
          fulfilledAt: status === 'FULFILLED' ? new Date(at.getTime() + 120_000) : null,
          cancelledAt: status === 'CANCELLED' ? new Date(at.getTime() + 300_000) : null,
          createdAt: at,
        });
        balance -= reward.pointsCost;
        history.ledger.push({
          id: uuidv7(at),
          tenantId,
          customerId,
          type: 'REDEEM',
          points: -reward.pointsCost,
          balanceAfter: balance,
          redemptionId,
          createdAt: at,
        });
        if (status === 'CANCELLED') {
          const cancelledAt = new Date(at.getTime() + 300_000);
          balance += reward.pointsCost;
          history.ledger.push({
            id: uuidv7(cancelledAt),
            tenantId,
            customerId,
            type: 'REVERSAL',
            points: reward.pointsCost,
            balanceAfter: balance,
            redemptionId,
            reason: 'Redemption cancelled',
            createdAt: cancelledAt,
          });
        }
      }
    }

    history.customers.push({
      id: customerId,
      tenantId,
      email: plan.email,
      name: plan.name,
      phone: random.chance(0.6)
        ? `+44 7700 9${String(random.int(0, 99999)).padStart(5, '0')}`
        : null,
      passwordHash: plan.passwordHash ?? null,
      tags: tenant.tags.filter(() => random.chance(0.12)),
      currentTierId: tier?.id ?? null,
      pointsBalance: balance,
      lifetimePoints: lifetime,
      createdAt: plan.joinedAt,
    });
  }

  history.dailyStats = aggregateDailyStats(tenantId, history, now);
  return history;
}

function planCustomers(
  tenant: DemoTenant,
  portalPasswordHash: string,
  now: Date,
  random: Random,
): CustomerPlan[] {
  const plans: CustomerPlan[] = [];
  const usedEmails = new Set<string>();
  const windowStart = now.getTime() - HISTORY_DAYS * DAY_MS;

  for (let i = 0; i < tenant.customerCount; i++) {
    const first = random.pick(FIRST_NAMES);
    const last = random.pick(LAST_NAMES);
    let email = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com';
    for (let n = 2; usedEmails.has(email); n++) email = email.replace(/(\d*)@/, `${n}@`);
    usedEmails.add(email);

    // More customers early on, so the programme visibly grows over the period.
    const joinedAt = new Date(windowStart + Math.pow(random.next(), 1.6) * HISTORY_DAYS * DAY_MS);
    const pattern = random.weighted<VisitPattern>([
      ['daily', 1],
      ['weekly', 4],
      ['monthly', 3],
      ['lapsed', 2],
    ]);
    const lastVisitBy =
      pattern === 'lapsed' ? new Date(now.getTime() - random.int(45, 100) * DAY_MS) : now;
    plans.push({ name: `${first} ${last}`, email, joinedAt, pattern, lastVisitBy });
  }

  if (tenant.portalCustomer) {
    plans.push({
      ...tenant.portalCustomer,
      passwordHash: portalPasswordHash,
      joinedAt: new Date(windowStart + 2 * DAY_MS),
      pattern: 'weekly',
      lastVisitBy: now,
    });
  }
  return plans;
}

function* visitTimes(
  tenant: DemoTenant,
  plan: CustomerPlan,
  now: Date,
  random: Random,
): Generator<Date> {
  const [minGap, maxGap] = tenant.visitGapDays[plan.pattern];
  let day = new Date(plan.joinedAt);
  const end = Math.min(plan.lastVisitBy.getTime(), now.getTime() - 60 * 60 * 1000);
  while (day.getTime() < end) {
    const visit = new Date(day);
    visit.setUTCHours(random.int(7, 17), random.int(0, 59), random.int(0, 59), 0);
    if (visit.getTime() < end) yield visit;
    day = new Date(day.getTime() + random.int(minGap, maxGap) * DAY_MS);
  }
}

function aggregateDailyStats(
  tenantId: string,
  history: History,
  now: Date,
): Prisma.DailyStatsCreateManyInput[] {
  const days = new Map<
    string,
    { earned: number; redeemed: number; newCustomers: number; purchases: number; revenue: number }
  >();
  const day = (date: Date | string | undefined) => {
    const key = new Date(date ?? now).toISOString().slice(0, 10);
    let stats = days.get(key);
    if (!stats) {
      stats = { earned: 0, redeemed: 0, newCustomers: 0, purchases: 0, revenue: 0 };
      days.set(key, stats);
    }
    return stats;
  };

  for (const c of history.customers) day(c.createdAt).newCustomers++;
  for (const p of history.purchases) {
    const stats = day(p.createdAt);
    stats.purchases++;
    stats.revenue += Number(p.amount);
  }
  for (const entry of history.ledger) {
    const stats = day(entry.createdAt);
    if (entry.type === 'EARN') stats.earned += entry.points;
    if (entry.type === 'REDEEM') stats.redeemed += -entry.points;
    if (entry.type === 'REVERSAL') stats.redeemed -= entry.points;
  }

  return [...days.entries()].map(([date, stats]) => ({
    tenantId,
    date: new Date(`${date}T00:00:00.000Z`),
    pointsEarned: stats.earned,
    pointsRedeemed: stats.redeemed,
    newCustomers: stats.newCustomers,
    purchases: stats.purchases,
    revenue: stats.revenue.toFixed(2),
  }));
}
