/**
 * Demo data. Safe to re-run: it deletes the demo businesses and users and recreates them,
 * which is also how the public demo resets nightly.
 *
 *   pnpm db:seed
 */
import argon2 from 'argon2';
import path from 'node:path';
import { createPrismaClient, type PrismaClient } from '../../src';
import { DEMO_PASSWORD, type DemoTenant, HISTORY_DAYS, TENANTS, TIERS } from './demo-data';
import { type History, simulateHistory } from './history';
import { createRandom, uuidv7 } from './random';

try {
  process.loadEnvFile(path.resolve(__dirname, '../../../../.env'));
} catch {
  // No .env file: rely on the real environment.
}

const SEED = 20260401;
const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 1000;

/** Saturday 00:00 UTC to the end of Sunday, for the coming (or current) weekend. */
function nextWeekend(now: Date): { startsAt: Date; endsAt: Date } {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() + (day === 0 ? -1 : 6 - day));
  return { startsAt: start, endsAt: new Date(start.getTime() + 2 * DAY_MS) };
}

async function reset(db: PrismaClient): Promise<void> {
  const emails = TENANTS.flatMap((t) => t.users.map((u) => u.email));
  // Deleting a tenant cascades to every row it owns.
  await db.tenant.deleteMany({ where: { slug: { in: TENANTS.map((t) => t.slug) } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
}

async function insertInBatches<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += BATCH) await insert(rows.slice(i, i + BATCH));
}

async function seedTenant(
  db: PrismaClient,
  demo: DemoTenant,
  passwordHash: string,
  now: Date,
  random: ReturnType<typeof createRandom>,
): Promise<History> {
  const tenant = await db.tenant.create({
    data: {
      name: demo.name,
      slug: demo.slug,
      plan: demo.plan,
      subscriptionStatus: demo.plan === 'PRO' ? 'active' : null,
      createdAt: new Date(now.getTime() - (HISTORY_DAYS + 7) * DAY_MS),
    },
  });
  await db.loyaltyProgram.create({
    data: {
      tenantId: tenant.id,
      currency: demo.currency,
      pointsPerCurrencyUnit: demo.pointsPerCurrencyUnit,
      pointsExpiryMonths: demo.pointsExpiryMonths,
    },
  });

  const tiers = TIERS.map((tier) => ({ ...tier, id: uuidv7(now) }));
  await db.tier.createMany({ data: tiers.map((tier) => ({ ...tier, tenantId: tenant.id })) });

  const rewards = demo.rewards.map((reward) => ({
    ...reward,
    id: uuidv7(now),
    stock: reward.stock ?? null,
  }));
  await db.reward.createMany({
    data: rewards.map((reward) => ({ ...reward, tenantId: tenant.id })),
  });

  // A past promotion (visible as a bump in the charts) and one coming up this weekend.
  const summer = {
    multiplier: '2.00',
    startsAt: new Date(now.getTime() - 70 * DAY_MS),
    endsAt: new Date(now.getTime() - 63 * DAY_MS),
  };
  await db.campaign.createMany({
    data: [
      { tenantId: tenant.id, name: 'Summer double points week', active: true, ...summer },
      {
        tenantId: tenant.id,
        name: 'Double points weekend',
        multiplier: '2.00',
        ...nextWeekend(now),
      },
    ],
  });

  const userIds: string[] = [];
  for (const user of demo.users) {
    const created = await db.user.create({
      data: {
        email: user.email,
        name: user.name,
        passwordHash,
        emailVerifiedAt: now,
        memberships: { create: { tenantId: tenant.id, role: user.role } },
      },
    });
    userIds.push(created.id);
  }

  const history = simulateHistory({
    tenant: demo,
    tenantId: tenant.id,
    tiers,
    rewards,
    pastCampaigns: [summer],
    staffUserIds: userIds,
    portalPasswordHash: passwordHash,
    now,
    random,
  });

  await insertInBatches(history.customers, (data) => db.customer.createMany({ data }));
  await insertInBatches(history.purchases, (data) => db.purchase.createMany({ data }));
  await insertInBatches(history.redemptions, (data) => db.redemption.createMany({ data }));
  await insertInBatches(history.ledger, (data) => db.pointsLedgerEntry.createMany({ data }));
  await insertInBatches(history.dailyStats, (data) => db.dailyStats.createMany({ data }));
  return history;
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const db = createPrismaClient({ connectionString });
  const started = Date.now();
  try {
    await reset(db);
    const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
    const now = new Date();
    const random = createRandom(SEED);

    for (const demo of TENANTS) {
      const history = await seedTenant(db, demo, passwordHash, now, random);
      const logins = [...demo.users.map((u) => u.email), demo.portalCustomer?.email]
        .filter(Boolean)
        .join(', ');
      console.log(
        `${demo.name} (${demo.plan}): ${history.customers.length} customers, ` +
          `${history.purchases.length} purchases, ${history.redemptions.length} redemptions — ${logins}`,
      );
    }
    console.log(`Password for every demo login: ${DEMO_PASSWORD}`);
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
