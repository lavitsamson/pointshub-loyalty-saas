import type { Customer, Redemption, Reward } from '@pointshub/shared';
import { type Owner, registerOwner } from './support/api-client';
import { createCustomer, createReward, recordPurchase } from './support/fixtures';
import { createTestApp, type TestApp } from './support/test-app';

/** Small deterministic PRNG (mulberry32) so a failing sequence can be replayed from its seed. */
function prng(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
  };
}

const SEED = Number(process.env.LEDGER_SEED ?? 20261013);
const OPERATIONS = 200;

describe('Ledger invariant', () => {
  let t: TestApp;
  let owner: Owner;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await registerOwner(t.app, 'Invariant Roasters');
  });

  afterAll(async () => {
    await t.close();
  });

  it(`holds after ${OPERATIONS} random operations (seed ${SEED})`, async () => {
    const random = prng(SEED);
    const base = `/tenants/${owner.tenantId}`;
    await owner.client.patch(`${base}/program`, { pointsPerCurrencyUnit: '10' }).expect(200);

    const customers: Customer[] = [];
    for (let i = 0; i < 6; i++) customers.push(await createCustomer(owner, { name: `C${i}` }));
    const rewards: Reward[] = [];
    for (const [pointsCost, stock] of [
      [50, null],
      [200, 5],
      [800, 2],
    ] as const) {
      rewards.push(await createReward(owner, { pointsCost, stock }));
    }

    const pending: Redemption[] = [];
    const outcomes: Record<string, number> = {};
    const tally = (op: string, status: number) => {
      const key = `${op} ${status}`;
      outcomes[key] = (outcomes[key] ?? 0) + 1;
    };

    for (let i = 0; i < OPERATIONS; i++) {
      const customer = random.pick(customers);
      const op = random.pick(['purchase', 'purchase', 'adjust', 'redeem', 'redeem', 'settle']);

      switch (op) {
        case 'purchase': {
          const amount = `${random.int(1, 60)}.${String(random.int(0, 99)).padStart(2, '0')}`;
          const res = await recordPurchase(owner.client, owner.tenantId, customer.id, amount);
          tally(op, res.status);
          break;
        }
        case 'adjust': {
          const points = random.int(-300, 300) || 1;
          const res = await owner.client.post(`${base}/customers/${customer.id}/adjustments`, {
            points,
            reason: 'Random adjustment',
          });
          tally(op, res.status);
          break;
        }
        case 'redeem': {
          const res = await owner.client.post(`${base}/redemptions`, {
            customerId: customer.id,
            rewardId: random.pick(rewards).id,
          });
          tally(op, res.status);
          if (res.status === 201) pending.push(res.body as Redemption);
          break;
        }
        case 'settle': {
          if (pending.length === 0) break;
          const redemption = pending.splice(random.int(0, pending.length - 1), 1)[0]!;
          const action = random.pick(['fulfil', 'cancel']);
          const res = await owner.client.post(`${base}/redemptions/${redemption.id}/${action}`);
          tally(action, res.status);
          break;
        }
      }
    }

    // Every request either succeeded or was refused cleanly; nothing failed unexpectedly.
    const unexpected = Object.keys(outcomes).filter((k) => !/ (200|201|409)$/.test(k));
    expect(unexpected).toEqual([]);
    // The run exercised both success and refusal paths.
    expect(outcomes['redeem 201']).toBeGreaterThan(0);
    expect(outcomes['redeem 409']).toBeGreaterThan(0);

    const db = t.prisma.unscoped;

    // 1. The cached balance equals the sum of the ledger, and lifetime points the sum of earnings.
    const mismatches = await db.$queryRaw<unknown[]>`
      SELECT c.id, c."pointsBalance", c."lifetimePoints",
             COALESCE(SUM(l.points), 0)::int AS ledger_sum,
             COALESCE(SUM(l.points) FILTER (WHERE l.type = 'EARN'), 0)::int AS earned
      FROM "Customer" c
      LEFT JOIN "PointsLedgerEntry" l ON l."customerId" = c.id
      WHERE c."tenantId" = ${owner.tenantId}::uuid
      GROUP BY c.id
      HAVING c."pointsBalance" <> COALESCE(SUM(l.points), 0)
          OR c."lifetimePoints" <> COALESCE(SUM(l.points) FILTER (WHERE l.type = 'EARN'), 0)`;
    expect(mismatches).toEqual([]);

    // 2. No balance was ever negative at any point in history.
    const negative = await db.pointsLedgerEntry.count({
      where: { tenantId: owner.tenantId, balanceAfter: { lt: 0 } },
    });
    expect(negative).toBe(0);

    // 3. Every redemption has exactly one REDEEM entry, and cancelled ones one REVERSAL.
    const redemptions = await db.redemption.findMany({
      where: { tenantId: owner.tenantId },
      include: { ledgerEntries: true },
    });
    for (const r of redemptions) {
      const types = r.ledgerEntries.map((e) => e.type).sort();
      expect(types).toEqual(r.status === 'CANCELLED' ? ['REDEEM', 'REVERSAL'] : ['REDEEM']);
    }

    // 4. Stock never went below zero and matches what was handed out.
    for (const reward of rewards.filter((r) => r.stock !== null)) {
      const row = await db.reward.findUniqueOrThrow({ where: { id: reward.id } });
      const outstanding = redemptions.filter(
        (r) => r.rewardId === reward.id && r.status !== 'CANCELLED',
      ).length;
      expect(row.stock).toBe(reward.stock! - outstanding);
      expect(row.stock).toBeGreaterThanOrEqual(0);
    }
  });
});
