import type { DailyStatsResponse, Redemption, TopRewardsResponse } from '@pointshub/shared';
import { type Owner, registerOwner } from './support/api-client';
import { addMember, createCustomer, createReward, givePoints } from './support/fixtures';
import { createTestApp, type TestApp } from './support/test-app';

const today = () => new Date().toISOString().slice(0, 10);

describe('Analytics', () => {
  let t: TestApp;
  let owner: Owner;
  let base: string;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await registerOwner(t.app);
    base = `/tenants/${owner.tenantId}/analytics`;

    // DailyStats is written by the worker; tests seed it directly.
    const stat = (date: string, earned: number, revenue: string) => ({
      tenantId: owner.tenantId,
      date: new Date(`${date}T00:00:00Z`),
      pointsEarned: earned,
      pointsRedeemed: 10,
      newCustomers: 1,
      purchases: 2,
      revenue,
    });
    await t.prisma.unscoped.dailyStats.createMany({
      data: [
        stat('2026-01-01', 100, '20.50'),
        stat('2026-01-03', 50, '9.25'),
        stat('2026-02-01', 999, '999.00'),
      ],
    });

    const other = await registerOwner(t.app);
    await t.prisma.unscoped.dailyStats.create({
      data: { ...stat('2026-01-02', 5000, '5000.00'), tenantId: other.tenantId },
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it('sums the range and counts current customers and active rewards', async () => {
    await createCustomer(owner);
    await createCustomer(owner);
    await createReward(owner);
    await createReward(owner, { active: false });

    const res = await owner.client.get(`${base}/summary?from=2026-01-01&to=2026-01-31`).expect(200);
    expect(res.body).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
      totalCustomers: 2,
      activeRewards: 1,
      newCustomers: 2,
      pointsEarned: 150,
      pointsRedeemed: 20,
      purchases: 4,
      revenue: '29.75',
    });
  });

  it('returns zeros for a range with no activity', async () => {
    const res = await owner.client.get(`${base}/summary?from=2025-01-01&to=2025-01-31`).expect(200);
    expect(res.body).toMatchObject({ pointsEarned: 0, purchases: 0, revenue: '0.00' });
  });

  it('defaults to the 30 days ending today', async () => {
    const res = await owner.client.get(`${base}/daily`).expect(200);
    const body = res.body as DailyStatsResponse;
    expect(body.to).toBe(today());
    expect(body.data).toHaveLength(30);
    expect(body.data.at(-1)?.date).toBe(today());
  });

  it('zero-fills days without stats', async () => {
    const res = await owner.client.get(`${base}/daily?from=2026-01-01&to=2026-01-03`).expect(200);
    expect((res.body as DailyStatsResponse).data).toEqual([
      expect.objectContaining({ date: '2026-01-01', pointsEarned: 100, revenue: '20.50' }),
      {
        date: '2026-01-02',
        pointsEarned: 0,
        pointsRedeemed: 0,
        newCustomers: 0,
        purchases: 0,
        revenue: '0.00',
      },
      expect.objectContaining({ date: '2026-01-03', pointsEarned: 50, revenue: '9.25' }),
    ]);
  });

  it('rejects an invalid or oversized range', async () => {
    await owner.client.get(`${base}/daily?from=2026-01-05&to=2026-01-01`).expect(400);
    await owner.client.get(`${base}/daily?from=2024-01-01&to=2026-01-01`).expect(400);
    await owner.client.get(`${base}/summary?from=yesterday`).expect(400);
  });

  it('ranks rewards by redemptions, ignoring cancelled ones', async () => {
    const t1 = `/tenants/${owner.tenantId}`;
    const customer = await createCustomer(owner);
    await givePoints(owner, customer.id, 1000);
    const coffee = await createReward(owner, { name: 'Coffee', pointsCost: 10 });
    const cake = await createReward(owner, { name: 'Cake', pointsCost: 20 });
    const redeem = async (rewardId: string) =>
      (
        await owner.client
          .post(`${t1}/redemptions`, { customerId: customer.id, rewardId })
          .expect(201)
      ).body as Redemption;

    await redeem(coffee.id);
    await redeem(coffee.id);
    await redeem(cake.id);
    const cancelled = await redeem(cake.id);
    await redeem(cake.id);
    await redeem(cake.id);
    await owner.client.post(`${t1}/redemptions/${cancelled.id}/cancel`).expect(200);

    const res = await owner.client.get(`${base}/top-rewards?limit=5`).expect(200);
    expect((res.body as TopRewardsResponse).data).toEqual([
      { rewardId: cake.id, name: 'Cake', redemptions: 3, pointsSpent: 60 },
      { rewardId: coffee.id, name: 'Coffee', redemptions: 2, pointsSpent: 20 },
    ]);

    const top1 = await owner.client.get(`${base}/top-rewards?limit=1`).expect(200);
    expect((top1.body as TopRewardsResponse).data).toHaveLength(1);

    const past = await owner.client
      .get(`${base}/top-rewards?from=2025-01-01&to=2025-01-31`)
      .expect(200);
    expect((past.body as TopRewardsResponse).data).toEqual([]);
  });

  it('is available to staff', async () => {
    const staff = await addMember(t, owner, 'STAFF');
    await staff.client.get(`${base}/summary`).expect(200);
    await staff.client.get(`${base}/daily`).expect(200);
    await staff.client.get(`${base}/top-rewards`).expect(200);
  });
});
