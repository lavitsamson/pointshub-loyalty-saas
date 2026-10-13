import type { Customer, Redemption, Reward } from '@pointshub/shared';
import { type Owner, registerOwner } from './support/api-client';
import { addMember, createCustomer, createReward, givePoints } from './support/fixtures';
import { createTestApp, type TestApp } from './support/test-app';

describe('Rewards and redemptions', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  const redeem = (owner: Owner, customerId: string, rewardId: string) =>
    owner.client.post(`/tenants/${owner.tenantId}/redemptions`, { customerId, rewardId });

  async function balanceOf(owner: Owner, customerId: string): Promise<number> {
    const res = await owner.client.get(`/tenants/${owner.tenantId}/customers/${customerId}`);
    return (res.body as Customer).pointsBalance;
  }

  async function stockOf(owner: Owner, rewardId: string): Promise<number | null> {
    const res = await owner.client.get(`/tenants/${owner.tenantId}/rewards/${rewardId}`);
    return (res.body as Reward).stock;
  }

  describe('reward catalogue', () => {
    it('supports create, update, filter and delete', async () => {
      const owner = await registerOwner(t.app);
      const base = `/tenants/${owner.tenantId}/rewards`;
      const reward = await createReward(owner, { name: 'Muffin', pointsCost: 120 });
      expect(reward).toMatchObject({ name: 'Muffin', stock: null, active: true, description: '' });

      await owner.client.patch(`${base}/${reward.id}`, { active: false, stock: 5 }).expect(200);
      const active = await owner.client.get(`${base}?active=true`).expect(200);
      expect(active.body.data).toEqual([]);
      const inactive = await owner.client.get(`${base}?active=false`).expect(200);
      expect(inactive.body.data).toEqual([expect.objectContaining({ id: reward.id, stock: 5 })]);

      await owner.client.delete(`${base}/${reward.id}`).expect(204);
      await owner.client.get(`${base}/${reward.id}`).expect(404);
    });

    it('lets staff browse but not edit', async () => {
      const owner = await registerOwner(t.app);
      const staff = await addMember(t, owner, 'STAFF');
      await createReward(owner);
      await staff.client.get(`/tenants/${owner.tenantId}/rewards`).expect(200);
      await staff.client
        .post(`/tenants/${owner.tenantId}/rewards`, { name: 'X', pointsCost: 1 })
        .expect(403);
    });

    it('rejects non-https image URLs', async () => {
      const owner = await registerOwner(t.app);
      await owner.client
        .post(`/tenants/${owner.tenantId}/rewards`, {
          name: 'X',
          pointsCost: 10,
          imageUrl: 'javascript:alert(1)',
        })
        .expect(400);
    });

    it('refuses to delete a reward that has been redeemed', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner);
      const reward = await createReward(owner, { pointsCost: 10 });
      await givePoints(owner, customer.id, 10);
      await redeem(owner, customer.id, reward.id).expect(201);
      const res = await owner.client
        .delete(`/tenants/${owner.tenantId}/rewards/${reward.id}`)
        .expect(409);
      expect(res.body.type).toBe('/problems/reward-in-use');
    });
  });

  describe('redeeming', () => {
    it('spends points, takes stock and returns a counter code', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner, { name: 'Ada' });
      const reward = await createReward(owner, { name: 'Latte', pointsCost: 150, stock: 3 });
      await givePoints(owner, customer.id, 200);

      const res = await redeem(owner, customer.id, reward.id).expect(201);
      expect(res.body as Redemption).toMatchObject({
        status: 'PENDING',
        pointsSpent: 150,
        code: expect.stringMatching(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/),
        customer: { id: customer.id, name: 'Ada' },
        reward: { id: reward.id, name: 'Latte' },
      });
      expect(await balanceOf(owner, customer.id)).toBe(50);
      expect(await stockOf(owner, reward.id)).toBe(2);
    });

    it('returns 409 and changes nothing when the customer cannot afford it', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner);
      const reward = await createReward(owner, { pointsCost: 100, stock: 1 });
      await givePoints(owner, customer.id, 99);

      const res = await redeem(owner, customer.id, reward.id).expect(409);
      expect(res.body.type).toBe('/problems/insufficient-points');
      expect(await balanceOf(owner, customer.id)).toBe(99);
      expect(await stockOf(owner, reward.id)).toBe(1);
      expect(await t.prisma.unscoped.redemption.count({ where: { rewardId: reward.id } })).toBe(0);
    });

    it('refuses inactive and out-of-stock rewards', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner);
      await givePoints(owner, customer.id, 1000);
      const inactive = await createReward(owner, { active: false });
      const soldOut = await createReward(owner, { stock: 0 });

      expect((await redeem(owner, customer.id, inactive.id).expect(409)).body.type).toBe(
        '/problems/reward-unavailable',
      );
      expect((await redeem(owner, customer.id, soldOut.id).expect(409)).body.type).toBe(
        '/problems/out-of-stock',
      );
    });

    it('finds a redemption by the code read out at the counter, in any format', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner);
      const reward = await createReward(owner, { pointsCost: 10 });
      await givePoints(owner, customer.id, 10);
      const { code } = (await redeem(owner, customer.id, reward.id).expect(201)).body as Redemption;

      const typed = code.replace('-', ' ').toLowerCase();
      const res = await owner.client
        .get(`/tenants/${owner.tenantId}/redemptions?code=${encodeURIComponent(typed)}`)
        .expect(200);
      expect(res.body.data).toEqual([expect.objectContaining({ code })]);
    });
  });

  describe('fulfilling and cancelling', () => {
    async function pendingRedemption() {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner);
      const reward = await createReward(owner, { pointsCost: 40, stock: 5 });
      await givePoints(owner, customer.id, 100);
      const redemption = (await redeem(owner, customer.id, reward.id).expect(201))
        .body as Redemption;
      return { owner, customer, reward, redemption };
    }

    it('lets staff fulfil a redemption once', async () => {
      const { owner, redemption } = await pendingRedemption();
      const staff = await addMember(t, owner, 'STAFF');
      const path = `/tenants/${owner.tenantId}/redemptions/${redemption.id}/fulfil`;

      const res = await staff.client.post(path).expect(200);
      expect(res.body).toMatchObject({ status: 'FULFILLED', fulfilledAt: expect.any(String) });
      const again = await staff.client.post(path).expect(409);
      expect(again.body.type).toBe('/problems/redemption-not-pending');
    });

    it('refunds the points and the stock on cancellation', async () => {
      const { owner, customer, reward, redemption } = await pendingRedemption();
      expect(await balanceOf(owner, customer.id)).toBe(60);

      await owner.client
        .post(`/tenants/${owner.tenantId}/redemptions/${redemption.id}/cancel`)
        .expect(200);

      expect(await balanceOf(owner, customer.id)).toBe(100);
      expect(await stockOf(owner, reward.id)).toBe(5);
      const ledger = await owner.client.get(
        `/tenants/${owner.tenantId}/customers/${customer.id}/ledger?limit=1`,
      );
      expect(ledger.body.data[0]).toMatchObject({
        type: 'REVERSAL',
        points: 40,
        redemptionId: redemption.id,
      });
    });

    it('cannot cancel a fulfilled redemption', async () => {
      const { owner, redemption } = await pendingRedemption();
      const base = `/tenants/${owner.tenantId}/redemptions/${redemption.id}`;
      await owner.client.post(`${base}/fulfil`).expect(200);
      await owner.client.post(`${base}/cancel`).expect(409);
    });

    it('does not let staff cancel (it credits points)', async () => {
      const { owner, redemption } = await pendingRedemption();
      const staff = await addMember(t, owner, 'STAFF');
      await staff.client
        .post(`/tenants/${owner.tenantId}/redemptions/${redemption.id}/cancel`)
        .expect(403);
    });
  });

  describe('concurrency', () => {
    it('never overspends when 10 redemptions race for the same balance', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner);
      const reward = await createReward(owner, { pointsCost: 100 });
      await givePoints(owner, customer.id, 350);

      const results = await Promise.all(
        Array.from({ length: 10 }, () => redeem(owner, customer.id, reward.id)),
      );
      const statuses = results.map((r) => r.status).sort();

      expect(statuses.filter((s) => s === 201)).toHaveLength(3);
      expect(statuses.filter((s) => s === 409)).toHaveLength(7);
      expect(await balanceOf(owner, customer.id)).toBe(50);
    });

    it('never sells more than the stock when different customers race', async () => {
      const owner = await registerOwner(t.app);
      const reward = await createReward(owner, { pointsCost: 10, stock: 2 });
      const customers = await Promise.all(Array.from({ length: 8 }, () => createCustomer(owner)));
      for (const c of customers) await givePoints(owner, c.id, 10);

      const results = await Promise.all(customers.map((c) => redeem(owner, c.id, reward.id)));

      expect(results.filter((r) => r.status === 201)).toHaveLength(2);
      expect(await stockOf(owner, reward.id)).toBe(0);
    });
  });
});
