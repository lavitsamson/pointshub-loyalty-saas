import type { Customer, LedgerEntry, PurchaseResult } from '@pointshub/shared';
import { randomUUID } from 'node:crypto';
import { type Owner, registerOwner } from './support/api-client';
import { addMember, createCustomer, givePoints, recordPurchase } from './support/fixtures';
import { createTestApp, type TestApp } from './support/test-app';

describe('Points: purchases and adjustments', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  const purchase = (owner: Owner, customerId: string, amount: string, key?: string) =>
    recordPurchase(owner.client, owner.tenantId, customerId, amount, key);

  async function outboxTypes(tenantId: string): Promise<string[]> {
    const events = await t.prisma.unscoped.outboxEvent.findMany({
      where: { tenantId },
      orderBy: { occurredAt: 'asc' },
    });
    return events.map((e) => e.type);
  }

  describe('POST /purchases', () => {
    it('awards floor(amount × rate × tier) points and records everything in one go', async () => {
      const owner = await registerOwner(t.app);
      await owner.client
        .patch(`/tenants/${owner.tenantId}/program`, { pointsPerCurrencyUnit: '10' })
        .expect(200);
      const customer = await createCustomer(owner);

      const res = await purchase(owner, customer.id, '4.75').expect(201);
      const result = res.body as PurchaseResult;
      expect(result).toMatchObject({
        pointsEarned: 47,
        balance: 47,
        tier: { name: 'Bronze' },
        tierChanged: false,
        purchase: { amount: '4.75', currency: 'GBP', customerId: customer.id },
      });

      const ledger = await owner.client
        .get(`/tenants/${owner.tenantId}/customers/${customer.id}/ledger`)
        .expect(200);
      expect(ledger.body.data).toEqual([
        expect.objectContaining({ type: 'EARN', points: 47, balanceAfter: 47, expiresAt: null }),
      ]);
      expect(await outboxTypes(owner.tenantId)).toEqual(['customer.created', 'points.earned']);
    });

    it('promotes the customer and applies the new multiplier to later purchases', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner);

      // Default programme: 1 point per £1; Silver at 500 lifetime points with 1.25x.
      const first = (await purchase(owner, customer.id, '500.00').expect(201))
        .body as PurchaseResult;
      expect(first).toMatchObject({
        pointsEarned: 500,
        tierChanged: true,
        tier: { name: 'Silver' },
      });

      const second = (await purchase(owner, customer.id, '100.00').expect(201))
        .body as PurchaseResult;
      expect(second.pointsEarned).toBe(125);
      expect(await outboxTypes(owner.tenantId)).toContain('tier.changed');
    });

    it('applies only the best active campaign', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner);
      const hour = 60 * 60 * 1000;
      const live = { startsAt: new Date(Date.now() - hour), endsAt: new Date(Date.now() + hour) };
      const base = `/tenants/${owner.tenantId}/campaigns`;
      await owner.client.post(base, { name: 'Double', multiplier: '2', ...live }).expect(201);
      await owner.client.post(base, { name: 'Triple', multiplier: '3', ...live }).expect(201);
      await owner.client
        .post(base, { name: 'Paused', multiplier: '5', active: false, ...live })
        .expect(201);
      await owner.client
        .post(base, {
          name: 'Next week',
          multiplier: '9',
          startsAt: new Date(Date.now() + 7 * 24 * hour),
          endsAt: new Date(Date.now() + 8 * 24 * hour),
        })
        .expect(201);

      const res = await purchase(owner, customer.id, '10.00').expect(201);
      expect((res.body as PurchaseResult).pointsEarned).toBe(30);
    });

    it('stamps an expiry date when the programme has one', async () => {
      const owner = await registerOwner(t.app);
      await owner.client
        .patch(`/tenants/${owner.tenantId}/program`, { pointsExpiryMonths: 12 })
        .expect(200);
      const customer = await createCustomer(owner);
      await purchase(owner, customer.id, '10').expect(201);

      const entry = await t.prisma.unscoped.pointsLedgerEntry.findFirstOrThrow({
        where: { customerId: customer.id },
      });
      const months =
        (entry.expiresAt!.getUTCFullYear() - entry.createdAt.getUTCFullYear()) * 12 +
        (entry.expiresAt!.getUTCMonth() - entry.createdAt.getUTCMonth());
      expect(months).toBe(12);
    });

    it('is open to staff', async () => {
      const owner = await registerOwner(t.app);
      const staff = await addMember(t, owner, 'STAFF');
      const customer = await createCustomer(owner);
      await recordPurchase(staff.client, owner.tenantId, customer.id, '5').expect(201);
    });

    it('validates the amount', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner);
      for (const amount of ['0', '-5', '1.234', 'ten']) {
        await purchase(owner, customer.id, amount).expect(400);
      }
    });

    it('returns 404 for an unknown customer', async () => {
      const owner = await registerOwner(t.app);
      await purchase(owner, randomUUID(), '5').expect(404);
    });
  });

  describe('idempotency', () => {
    it('requires an Idempotency-Key', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner);
      const res = await owner.client
        .post(`/tenants/${owner.tenantId}/purchases`, { customerId: customer.id, amount: '5' })
        .expect(400);
      expect(res.body.type).toBe('/problems/idempotency-key-required');
    });

    it('records a retried request once and replays the original result', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner);
      const key = randomUUID();

      const first = await purchase(owner, customer.id, '20.00', key).expect(201);
      const retry = await purchase(owner, customer.id, '20.00', key).expect(201);

      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.body.purchase).toEqual(first.body.purchase);
      expect(retry.body.pointsEarned).toBe(first.body.pointsEarned);
      expect(await t.prisma.unscoped.purchase.count({ where: { customerId: customer.id } })).toBe(
        1,
      );
      const c = await owner.client.get(`/tenants/${owner.tenantId}/customers/${customer.id}`);
      expect((c.body as Customer).pointsBalance).toBe(20);
    });

    it('records exactly one purchase when the same request arrives 10 times at once', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner);
      const key = randomUUID();

      const responses = await Promise.all(
        Array.from({ length: 10 }, () => purchase(owner, customer.id, '7.00', key)),
      );
      expect(responses.map((r) => r.status)).toEqual(Array(10).fill(201));
      expect(new Set(responses.map((r) => r.body.purchase.id)).size).toBe(1);
      expect(await t.prisma.unscoped.purchase.count({ where: { customerId: customer.id } })).toBe(
        1,
      );
      expect(
        await t.prisma.unscoped.pointsLedgerEntry.count({ where: { customerId: customer.id } }),
      ).toBe(1);
    });

    it('rejects a key reused for a different purchase', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner);
      const key = randomUUID();
      await purchase(owner, customer.id, '5.00', key).expect(201);
      const res = await purchase(owner, customer.id, '50.00', key).expect(422);
      expect(res.body.type).toBe('/problems/idempotency-key-reused');
    });

    it('scopes keys to the business', async () => {
      const a = await registerOwner(t.app);
      const b = await registerOwner(t.app);
      const key = randomUUID();
      await purchase(a, (await createCustomer(a)).id, '5', key).expect(201);
      await purchase(b, (await createCustomer(b)).id, '5', key).expect(201);
    });
  });

  describe('POST /customers/:id/adjustments', () => {
    it('adds and removes points with a reason, audited', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner);
      const path = `/tenants/${owner.tenantId}/customers/${customer.id}/adjustments`;

      await owner.client.post(path, { points: 100, reason: 'Goodwill' }).expect(201);
      const res = await owner.client.post(path, { points: -30, reason: 'Correction' }).expect(201);
      expect(res.body as LedgerEntry).toMatchObject({
        type: 'ADJUST',
        points: -30,
        balanceAfter: 70,
        reason: 'Correction',
      });

      const c = await owner.client.get(`/tenants/${owner.tenantId}/customers/${customer.id}`);
      // Adjustments do not count towards tiers.
      expect(c.body).toMatchObject({ pointsBalance: 70, lifetimePoints: 0 });

      const audit = await owner.client.get(`/tenants/${owner.tenantId}/audit-logs?limit=1`);
      expect(audit.body.data[0]).toMatchObject({
        action: 'points.adjusted',
        entityId: customer.id,
      });
    });

    it('never lets a balance go negative', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner);
      await givePoints(owner, customer.id, 10);
      const res = await owner.client
        .post(`/tenants/${owner.tenantId}/customers/${customer.id}/adjustments`, {
          points: -11,
          reason: 'Too much',
        })
        .expect(409);
      expect(res.body.type).toBe('/problems/insufficient-points');
    });

    it('requires a reason', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner);
      await owner.client
        .post(`/tenants/${owner.tenantId}/customers/${customer.id}/adjustments`, { points: 5 })
        .expect(400);
    });

    it('is not available to staff', async () => {
      const owner = await registerOwner(t.app);
      const staff = await addMember(t, owner, 'STAFF');
      const customer = await createCustomer(owner);
      await staff.client
        .post(`/tenants/${owner.tenantId}/customers/${customer.id}/adjustments`, {
          points: 5,
          reason: 'Sneaky',
        })
        .expect(403);
    });
  });
});
