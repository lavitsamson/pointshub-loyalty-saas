/**
 * Performance dataset: one business with 50,000 customers and about 500,000 ledger entries
 * (and the purchases behind them), for measuring the customer list at realistic scale.
 * Safe to re-run: it deletes and recreates the load-test business.
 *
 *   pnpm db:seed:perf
 *
 * Sign in as owner@loadtest.demo (password DemoPass123!).
 */
import { tierFor } from '@pointshub/shared';
import argon2 from 'argon2';
import path from 'node:path';
import { createPrismaClient, type PrismaClient } from '../../src';
import { DEMO_PASSWORD, FIRST_NAMES, LAST_NAMES, TIERS } from './demo-data';
import { createRandom, uuidv7 } from './random';

try {
  process.loadEnvFile(path.resolve(__dirname, '../../../../.env'));
} catch {
  // No .env file: rely on the real environment.
}

const CUSTOMERS = 50_000;
const ENTRIES_PER_CUSTOMER = { min: 4, max: 16 };
/** Customers generated and inserted together, to keep memory flat. */
const CHUNK = 2_000;
/** Rows per INSERT: ledger rows have 14 columns, and Postgres allows 65,535 parameters. */
const BATCH = 2_000;
const SLUG = 'load-test';
const OWNER_EMAIL = 'owner@loadtest.demo';
const TAGS = ['vip', 'student', 'staff', 'newsletter', 'corporate', 'birthday-month'];
const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 730;

async function insertInBatches<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += BATCH) await insert(rows.slice(i, i + BATCH));
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const db: PrismaClient = createPrismaClient({ connectionString });
  const started = Date.now();
  const random = createRandom(20261020);
  const now = new Date();

  try {
    await db.tenant.deleteMany({ where: { slug: SLUG } });
    await db.user.deleteMany({ where: { email: OWNER_EMAIL } });

    const tenant = await db.tenant.create({
      data: { name: 'Load Test Roastery', slug: SLUG, plan: 'PRO', subscriptionStatus: 'active' },
    });
    await db.loyaltyProgram.create({
      data: { tenantId: tenant.id, currency: 'GBP', pointsPerCurrencyUnit: '1' },
    });
    const tiers = TIERS.map((tier) => ({ ...tier, id: uuidv7(now) }));
    await db.tier.createMany({ data: tiers.map((tier) => ({ ...tier, tenantId: tenant.id })) });
    const owner = await db.user.create({
      data: {
        email: OWNER_EMAIL,
        name: 'Load Test Owner',
        passwordHash: await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id }),
        emailVerifiedAt: now,
        memberships: { create: { tenantId: tenant.id, role: 'OWNER' } },
      },
    });

    let ledgerCount = 0;
    for (let first = 0; first < CUSTOMERS; first += CHUNK) {
      const customers = [];
      const purchases = [];
      const ledger = [];

      for (let n = first; n < Math.min(first + CHUNK, CUSTOMERS); n++) {
        const joined = new Date(now.getTime() - random.int(30, HISTORY_DAYS) * DAY_MS);
        const firstName = random.pick(FIRST_NAMES);
        const lastName = random.pick(LAST_NAMES);
        const customerId = uuidv7(joined);
        let balance = 0;
        let lifetime = 0;
        let tier = tierFor(tiers, 0);
        let at = joined.getTime();
        const step = (now.getTime() - at) / (ENTRIES_PER_CUSTOMER.max + 1);

        const entries = random.int(ENTRIES_PER_CUSTOMER.min, ENTRIES_PER_CUSTOMER.max);
        for (let e = 0; e < entries; e++) {
          at += random.int(1, Math.max(1, Math.floor(step)));
          const createdAt = new Date(at);
          if (balance > 50 && random.chance(0.15)) {
            // A manual correction now and then, never below zero.
            const points = -random.int(1, Math.min(balance, 200));
            balance += points;
            ledger.push({
              id: uuidv7(createdAt),
              tenantId: tenant.id,
              customerId,
              type: 'ADJUST' as const,
              points,
              balanceAfter: balance,
              reason: 'Correction',
              createdByUserId: owner.id,
              createdAt,
            });
            continue;
          }
          const pence = random.int(250, 6_000);
          const multiplier = Math.round(Number(tier?.multiplier ?? '1') * 100);
          const points = Math.floor((pence * multiplier) / 10_000);
          const purchaseId = uuidv7(createdAt);
          purchases.push({
            id: purchaseId,
            tenantId: tenant.id,
            customerId,
            amount: (pence / 100).toFixed(2),
            currency: 'GBP',
            recordedByUserId: owner.id,
            idempotencyKey: `perf-${purchaseId}`,
            createdAt,
          });
          balance += points;
          lifetime += points;
          tier = tierFor(tiers, lifetime, tier);
          ledger.push({
            id: uuidv7(createdAt),
            tenantId: tenant.id,
            customerId,
            type: 'EARN' as const,
            points,
            balanceAfter: balance,
            purchaseId,
            createdByUserId: owner.id,
            createdAt,
          });
        }

        customers.push({
          id: customerId,
          tenantId: tenant.id,
          email: `${firstName}.${lastName}.${n}@perf.example`.toLowerCase(),
          name: `${firstName} ${lastName}`,
          phone: random.chance(0.6) ? `07${random.int(100_000_000, 999_999_999)}` : null,
          tags: TAGS.filter(() => random.chance(0.12)),
          currentTierId: tier?.id ?? null,
          pointsBalance: balance,
          lifetimePoints: lifetime,
          createdAt: joined,
        });
      }

      await insertInBatches(customers, (data) => db.customer.createMany({ data }));
      await insertInBatches(purchases, (data) => db.purchase.createMany({ data }));
      await insertInBatches(ledger, (data) => db.pointsLedgerEntry.createMany({ data }));
      ledgerCount += ledger.length;
      process.stdout.write(
        `\r${first + customers.length} customers, ${ledgerCount} ledger entries`,
      );
    }

    // Fresh statistics, so the planner sees the new table sizes straight away.
    await db.$executeRawUnsafe('ANALYZE "Customer", "PointsLedgerEntry", "Purchase"');
    console.log(`\nLoad Test Roastery — sign in as ${OWNER_EMAIL} / ${DEMO_PASSWORD}`);
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
