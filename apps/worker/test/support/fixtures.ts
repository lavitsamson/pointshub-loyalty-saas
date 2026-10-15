import type { LedgerEntryType, PrismaClient } from '@pointshub/db';
import { randomUUID } from 'node:crypto';

const unique = () => randomUUID().slice(0, 8);

export async function createTenant(prisma: PrismaClient, name = 'Test Café') {
  return prisma.tenant.create({ data: { name, slug: `test-${unique()}` } });
}

export async function createCustomer(prisma: PrismaClient, tenantId: string, name = 'Amira Khan') {
  return prisma.customer.create({
    data: { tenantId, name, email: `customer-${unique()}@example.com` },
  });
}

export interface Movement {
  type: LedgerEntryType;
  points: number;
  /** When the entry was written. */
  at: Date;
  expiresAt?: Date;
}

/**
 * Writes a ledger history the way the API would have (running balanceAfter, cached
 * balance and lifetime points), without going through HTTP.
 */
export async function writeHistory(
  prisma: PrismaClient,
  tenantId: string,
  customerId: string,
  movements: Movement[],
) {
  let balance = 0;
  let lifetime = 0;
  for (const m of movements) {
    balance += m.points;
    if (m.type === 'EARN') lifetime += m.points;
    await prisma.pointsLedgerEntry.create({
      data: {
        tenantId,
        customerId,
        type: m.type,
        points: m.points,
        balanceAfter: balance,
        expiresAt: m.expiresAt ?? null,
        createdAt: m.at,
      },
    });
  }
  await prisma.customer.update({
    where: { id: customerId },
    data: { pointsBalance: balance, lifetimePoints: lifetime },
  });
}

/** The ledger invariant from ADR 0003: cached balance equals the sum of entries. */
export async function ledgerSum(prisma: PrismaClient, customerId: string) {
  const { _sum } = await prisma.pointsLedgerEntry.aggregate({
    where: { customerId },
    _sum: { points: true },
  });
  return _sum.points ?? 0;
}

/** Marks every pending outbox row as published, so a test starts from a clean outbox. */
export async function drainOutbox(prisma: PrismaClient) {
  await prisma.outboxEvent.updateMany({
    where: { publishedAt: null },
    data: { publishedAt: new Date() },
  });
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const daysFrom = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);
