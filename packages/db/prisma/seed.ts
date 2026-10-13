/**
 * Demo data. Safe to re-run: it deletes the demo tenants and users and recreates them,
 * which is also how the public demo resets nightly.
 *
 *   pnpm db:seed
 */
import argon2 from 'argon2';
import path from 'node:path';
import { createPrismaClient, type PrismaClient, type Role } from '../src';

try {
  process.loadEnvFile(path.resolve(__dirname, '../../../.env'));
} catch {
  // No .env file: rely on the real environment.
}

export const DEMO_PASSWORD = 'DemoPass123!';

interface DemoTenant {
  name: string;
  slug: string;
  plan: 'FREE' | 'PRO';
  currency: string;
  pointsPerCurrencyUnit: string;
  pointsExpiryMonths: number | null;
  users: Array<{ email: string; name: string; role: Role }>;
  rewards: Array<{ name: string; description: string; pointsCost: number; stock?: number }>;
  campaigns: Array<{ name: string; multiplier: string; startsAt: Date; endsAt: Date }>;
}

const TIERS = [
  { name: 'Bronze', minLifetimePoints: 0, multiplier: '1.00', sortOrder: 1 },
  { name: 'Silver', minLifetimePoints: 500, multiplier: '1.25', sortOrder: 2 },
  { name: 'Gold', minLifetimePoints: 1500, multiplier: '1.50', sortOrder: 3 },
];

/** Saturday 00:00 to Sunday 23:59:59 of the coming weekend (or the current one). */
function nextWeekend(now = new Date()): { startsAt: Date; endsAt: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const daysUntilSaturday = (6 - start.getDay() + 7) % 7;
  start.setDate(start.getDate() + (now.getDay() === 0 ? -1 : daysUntilSaturday));
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  end.setMilliseconds(-1);
  return { startsAt: start, endsAt: end };
}

const TENANTS: DemoTenant[] = [
  {
    name: 'Bean & Brew Café',
    slug: 'bean-and-brew',
    plan: 'PRO',
    currency: 'GBP',
    pointsPerCurrencyUnit: '10',
    pointsExpiryMonths: 12,
    users: [
      { email: 'owner@beanbrew.demo', name: 'Olivia Bennett', role: 'OWNER' },
      { email: 'staff@beanbrew.demo', name: 'Sam Patel', role: 'STAFF' },
    ],
    rewards: [
      { name: 'Free espresso', description: 'Any single or double espresso.', pointsCost: 150 },
      {
        name: 'Pastry of your choice',
        description: 'From the counter, while stocks last.',
        pointsCost: 200,
      },
      { name: 'Free cappuccino', description: 'Any size, any milk.', pointsCost: 250 },
      {
        name: '10% off a bag of beans',
        description: 'Applies to any retail coffee bag.',
        pointsCost: 300,
      },
      {
        name: 'Lunch combo',
        description: 'Sandwich, soup or salad with a regular drink.',
        pointsCost: 600,
      },
      {
        name: 'Bag of house beans',
        description: '250 g of our house blend, whole or ground.',
        pointsCost: 800,
      },
      { name: 'Branded keep-cup', description: 'Reusable 12 oz cup.', pointsCost: 1000, stock: 25 },
      {
        name: 'Home-brew masterclass',
        description: 'A one-hour session with our head barista.',
        pointsCost: 1500,
        stock: 10,
      },
    ],
    campaigns: [{ name: 'Double points weekend', multiplier: '2.00', ...nextWeekend() }],
  },
  {
    name: 'Studio Bloom Salon',
    slug: 'studio-bloom',
    plan: 'FREE',
    currency: 'GBP',
    pointsPerCurrencyUnit: '1',
    pointsExpiryMonths: null,
    users: [{ email: 'owner@studiobloom.demo', name: 'Maya Okafor', role: 'OWNER' }],
    rewards: [
      { name: 'Free fringe trim', description: 'Between full appointments.', pointsCost: 100 },
      { name: 'Deep-conditioning treatment', description: 'Added to any cut.', pointsCost: 250 },
      { name: '£15 off colour', description: 'Any colour service.', pointsCost: 400 },
    ],
    campaigns: [],
  },
];

async function reset(db: PrismaClient): Promise<void> {
  const slugs = TENANTS.map((t) => t.slug);
  const emails = TENANTS.flatMap((t) => t.users.map((u) => u.email));
  // Tenant deletion cascades to every tenant-owned row.
  await db.tenant.deleteMany({ where: { slug: { in: slugs } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
}

async function seedTenant(db: PrismaClient, demo: DemoTenant, passwordHash: string) {
  const tenant = await db.tenant.create({
    data: { name: demo.name, slug: demo.slug, plan: demo.plan },
  });
  await db.loyaltyProgram.create({
    data: {
      tenantId: tenant.id,
      currency: demo.currency,
      pointsPerCurrencyUnit: demo.pointsPerCurrencyUnit,
      pointsExpiryMonths: demo.pointsExpiryMonths,
    },
  });
  await db.tier.createMany({ data: TIERS.map((tier) => ({ ...tier, tenantId: tenant.id })) });
  await db.reward.createMany({
    data: demo.rewards.map((reward) => ({ ...reward, tenantId: tenant.id })),
  });
  await db.campaign.createMany({
    data: demo.campaigns.map((campaign) => ({ ...campaign, tenantId: tenant.id })),
  });

  for (const user of demo.users) {
    await db.user.create({
      data: {
        email: user.email,
        name: user.name,
        passwordHash,
        emailVerifiedAt: new Date(),
        memberships: { create: { tenantId: tenant.id, role: user.role } },
      },
    });
  }
  return tenant;
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const db = createPrismaClient({ connectionString });
  try {
    await reset(db);
    const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
    for (const demo of TENANTS) {
      const tenant = await seedTenant(db, demo, passwordHash);
      console.log(
        `Seeded ${tenant.name} (${demo.plan}) — logins: ${demo.users.map((u) => u.email).join(', ')}`,
      );
    }
    console.log(`Password for every demo login: ${DEMO_PASSWORD}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
