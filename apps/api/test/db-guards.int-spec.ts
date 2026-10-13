import { randomUUID } from 'node:crypto';
import { createPrismaClient, type PrismaClient } from '@pointshub/db';
import { testEnv } from './support/infra';

describe('Database-level guards', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createPrismaClient({ connectionString: testEnv().DATABASE_URL });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function createCustomer() {
    const tenant = await prisma.tenant.create({
      data: { name: 'Guard Test', slug: `guard-${randomUUID()}` },
    });
    const customer = await prisma.customer.create({
      data: { tenantId: tenant.id, email: 'c@example.com', name: 'C' },
    });
    return { tenant, customer };
  }

  it('rejects updates to ledger entries', async () => {
    const { tenant, customer } = await createCustomer();
    const entry = await prisma.pointsLedgerEntry.create({
      data: {
        tenantId: tenant.id,
        customerId: customer.id,
        type: 'ADJUST',
        points: 10,
        balanceAfter: 10,
        reason: 'test',
      },
    });

    await expect(
      prisma.pointsLedgerEntry.update({ where: { id: entry.id }, data: { points: 1_000 } }),
    ).rejects.toThrow(/append-only/);
  });

  it('allows ledger rows to be removed when their tenant is deleted', async () => {
    const { tenant, customer } = await createCustomer();
    await prisma.pointsLedgerEntry.create({
      data: {
        tenantId: tenant.id,
        customerId: customer.id,
        type: 'ADJUST',
        points: 5,
        balanceAfter: 5,
      },
    });

    await prisma.tenant.delete({ where: { id: tenant.id } });

    await expect(prisma.pointsLedgerEntry.count({ where: { tenantId: tenant.id } })).resolves.toBe(
      0,
    );
  });

  it('requires a refresh token to have exactly one owner', async () => {
    await expect(
      prisma.refreshToken.create({
        data: {
          tokenHash: 'orphan',
          familyId: '0192a6f0-0000-7000-8000-000000000001',
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toThrow(/RefreshToken_exactly_one_owner/);
  });
});
