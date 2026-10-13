import type { Tier } from '@pointshub/shared';
import { registerOwner } from './support/api-client';
import { addMember } from './support/fixtures';
import { createTestApp, type TestApp } from './support/test-app';

describe('Programme, tiers and campaigns', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('exposes and updates the programme settings', async () => {
    const owner = await registerOwner(t.app);
    const base = `/tenants/${owner.tenantId}/program`;
    expect((await owner.client.get(base).expect(200)).body).toEqual({
      pointsPerCurrencyUnit: '1',
      currency: 'GBP',
      pointsExpiryMonths: null,
    });

    const res = await owner.client
      .patch(base, { pointsPerCurrencyUnit: 2.5, pointsExpiryMonths: 6 })
      .expect(200);
    expect(res.body).toMatchObject({ pointsPerCurrencyUnit: '2.5', pointsExpiryMonths: 6 });

    await owner.client.patch(base, { pointsPerCurrencyUnit: '0' }).expect(400);
    await owner.client.patch(base, { pointsExpiryMonths: null }).expect(200);
  });

  it('lists tiers by threshold and manages them', async () => {
    const owner = await registerOwner(t.app);
    const base = `/tenants/${owner.tenantId}/tiers`;

    const created = await owner.client
      .post(base, { name: 'Platinum', minLifetimePoints: 5000, multiplier: '2', sortOrder: 4 })
      .expect(201);
    const platinum = created.body as Tier;
    expect(platinum.multiplier).toBe('2.00');

    const list = await owner.client.get(`${base}?limit=3`).expect(200);
    expect((list.body.data as Tier[]).map((tier) => tier.name)).toEqual([
      'Bronze',
      'Silver',
      'Gold',
    ]);
    const next = await owner.client
      .get(`${base}?limit=3&cursor=${list.body.pageInfo.nextCursor}`)
      .expect(200);
    expect((next.body.data as Tier[]).map((tier) => tier.name)).toEqual(['Platinum']);

    await owner.client.patch(`${base}/${platinum.id}`, { multiplier: '2.5' }).expect(200);
    const dup = await owner.client.patch(`${base}/${platinum.id}`, { name: 'Gold' }).expect(409);
    expect(dup.body.type).toBe('/problems/duplicate-tier');
    await owner.client
      .post(base, { name: 'Bronze', minLifetimePoints: 1, multiplier: '1', sortOrder: 9 })
      .expect(409);

    await owner.client.delete(`${base}/${platinum.id}`).expect(204);
    await owner.client.delete(`${base}/${platinum.id}`).expect(404);
  });

  it('validates campaign windows and multipliers', async () => {
    const owner = await registerOwner(t.app);
    const base = `/tenants/${owner.tenantId}/campaigns`;
    const start = new Date('2026-12-01T00:00:00Z');
    const end = new Date('2026-12-02T00:00:00Z');

    await owner.client
      .post(base, { name: 'Backwards', multiplier: '2', startsAt: end, endsAt: start })
      .expect(400);
    await owner.client
      .post(base, { name: 'Penalty', multiplier: '0.5', startsAt: start, endsAt: end })
      .expect(400);

    const created = await owner.client
      .post(base, { name: 'Christmas', multiplier: '2', startsAt: start, endsAt: end })
      .expect(201);
    await owner.client
      .patch(`${base}/${created.body.id}`, { endsAt: '2026-11-30T00:00:00Z' })
      .expect(400);
    const paused = await owner.client
      .patch(`${base}/${created.body.id}`, { active: false })
      .expect(200);
    expect(paused.body.active).toBe(false);

    await owner.client.delete(`${base}/${created.body.id}`).expect(204);
  });

  it('lets staff read but not change the programme', async () => {
    const owner = await registerOwner(t.app);
    const staff = await addMember(t, owner, 'STAFF');
    const base = `/tenants/${owner.tenantId}`;
    await staff.client.get(`${base}/program`).expect(200);
    await staff.client.get(`${base}/tiers`).expect(200);
    await staff.client.patch(`${base}/program`, { pointsExpiryMonths: 1 }).expect(403);
    await staff.client
      .post(`${base}/tiers`, { name: 'X', minLifetimePoints: 1, multiplier: '1', sortOrder: 1 })
      .expect(403);
  });
});
