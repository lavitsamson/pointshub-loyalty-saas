import type { Customer, Redemption, Reward } from '@pointshub/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { type Owner, registerOwner, uniqueEmail } from './support/api-client';
import { createCustomer, createReward, givePoints } from './support/fixtures';
import { createTestApp, type TestApp } from './support/test-app';

/**
 * Tenant isolation suite.
 *
 * Owner A attacks tenant B through every tenant-scoped endpoint, and must always get 404:
 * the API must neither leak B's data nor confirm that B exists. Requests are made as an
 * OWNER, the most privileged role, so a pass here is not explained by a permission check.
 *
 * Three angles are covered:
 *   1. B's tenant id in the URL.
 *   2. A's own tenant id in the URL with B's resource ids in the path.
 *   3. A's own tenant id with B's resource ids in the request body (IDOR via body).
 *
 * The last test reads the OpenAPI document and fails if a tenant-scoped route exists that
 * this suite does not cover, so new endpoints cannot skip isolation testing.
 */

type Method = 'get' | 'post' | 'patch' | 'delete';

/** Ids of resources that really exist in the victim's business, filled in beforeAll. */
interface Ids {
  tenantId: string;
  userId: string;
  invitationId: string;
  tierId: string;
  campaignId: string;
  customerId: string;
  rewardId: string;
  redemptionId: string;
}

interface Probe {
  method: Method;
  /** Path template exactly as it appears in the OpenAPI document. */
  route: string;
  /** A valid body, so that a refusal cannot be explained by validation. */
  body?: (ids: Ids) => object;
}

const T = '/api/v1/tenants/{tenantId}';
const hour = 60 * 60 * 1000;

const PROBES: Probe[] = [
  { method: 'get', route: T },
  { method: 'patch', route: T, body: () => ({ name: 'Pwned' }) },
  { method: 'get', route: `${T}/members` },
  { method: 'patch', route: `${T}/members/{userId}`, body: () => ({ role: 'ADMIN' }) },
  { method: 'delete', route: `${T}/members/{userId}` },
  {
    method: 'post',
    route: `${T}/invitations`,
    body: () => ({ email: 'intruder@example.test', role: 'ADMIN' }),
  },
  { method: 'get', route: `${T}/invitations` },
  { method: 'delete', route: `${T}/invitations/{invitationId}` },
  { method: 'get', route: `${T}/audit-logs` },

  { method: 'get', route: `${T}/program` },
  { method: 'patch', route: `${T}/program`, body: () => ({ pointsPerCurrencyUnit: '100' }) },
  { method: 'get', route: `${T}/tiers` },
  {
    method: 'post',
    route: `${T}/tiers`,
    body: () => ({ name: 'Evil', minLifetimePoints: 1, multiplier: '9', sortOrder: 9 }),
  },
  { method: 'patch', route: `${T}/tiers/{tierId}`, body: () => ({ multiplier: '9' }) },
  { method: 'delete', route: `${T}/tiers/{tierId}` },
  { method: 'get', route: `${T}/campaigns` },
  {
    method: 'post',
    route: `${T}/campaigns`,
    body: () => ({
      name: 'Evil',
      multiplier: '9',
      startsAt: new Date(Date.now() - hour),
      endsAt: new Date(Date.now() + hour),
    }),
  },
  { method: 'patch', route: `${T}/campaigns/{campaignId}`, body: () => ({ multiplier: '9' }) },
  { method: 'delete', route: `${T}/campaigns/{campaignId}` },

  { method: 'get', route: `${T}/customers` },
  { method: 'post', route: `${T}/customers`, body: () => ({ name: 'Spy', email: 'spy@x.test' }) },
  { method: 'get', route: `${T}/customers/export` },
  {
    method: 'post',
    route: `${T}/customers/bulk`,
    body: (ids) => ({
      action: 'ADJUST_POINTS',
      customerIds: [ids.customerId],
      params: { points: 1000, reason: 'Stolen' },
    }),
  },
  { method: 'get', route: `${T}/customers/{customerId}` },
  { method: 'patch', route: `${T}/customers/{customerId}`, body: () => ({ name: 'Pwned' }) },
  { method: 'get', route: `${T}/customers/{customerId}/ledger` },
  {
    method: 'post',
    route: `${T}/customers/{customerId}/adjustments`,
    body: () => ({ points: 1000, reason: 'Stolen' }),
  },
  {
    method: 'post',
    route: `${T}/purchases`,
    body: (ids) => ({ customerId: ids.customerId, amount: '1000' }),
  },

  { method: 'get', route: `${T}/rewards` },
  { method: 'post', route: `${T}/rewards`, body: () => ({ name: 'Evil', pointsCost: 1 }) },
  { method: 'get', route: `${T}/rewards/{rewardId}` },
  { method: 'patch', route: `${T}/rewards/{rewardId}`, body: () => ({ pointsCost: 1 }) },
  { method: 'delete', route: `${T}/rewards/{rewardId}` },
  {
    method: 'post',
    route: `${T}/redemptions`,
    body: (ids) => ({ customerId: ids.customerId, rewardId: ids.rewardId }),
  },
  { method: 'get', route: `${T}/redemptions` },
  { method: 'post', route: `${T}/redemptions/{redemptionId}/fulfil` },
  { method: 'post', route: `${T}/redemptions/{redemptionId}/cancel` },
];

function fill(route: string, ids: Ids): string {
  return route.replace(/\{(\w+)\}/g, (_, key: string) => ids[key as keyof Ids]);
}

const label = (p: Probe) => `${p.method.toUpperCase()} ${p.route.replace('/api/v1', '')}`;

describe('Tenant isolation', () => {
  let t: TestApp;
  let attacker: Owner;
  let victim: Owner;
  let victimIds: Ids;
  let attackerCustomer: Customer;
  let attackerReward: Reward;

  beforeAll(async () => {
    t = await createTestApp();
    attacker = await registerOwner(t.app, 'Attacker Co');
    victim = await registerOwner(t.app, 'Victim Co');
    const v = `/tenants/${victim.tenantId}`;

    const invitation = await victim.client
      .post(`${v}/invitations`, { email: uniqueEmail(), role: 'STAFF' })
      .expect(201);
    const tiers = await victim.client.get(`${v}/tiers`).expect(200);
    const campaign = await victim.client
      .post(`${v}/campaigns`, {
        name: 'Victim campaign',
        multiplier: '2',
        startsAt: new Date(Date.now() + hour),
        endsAt: new Date(Date.now() + 2 * hour),
      })
      .expect(201);
    const customer = await createCustomer(victim, { name: 'Victim Customer' });
    const reward = await createReward(victim, { pointsCost: 10, stock: 5 });
    await givePoints(victim, customer.id, 100);
    const redemption = (
      await victim.client
        .post(`${v}/redemptions`, { customerId: customer.id, rewardId: reward.id })
        .expect(201)
    ).body as Redemption;

    victimIds = {
      tenantId: victim.tenantId,
      userId: victim.userId,
      invitationId: (invitation.body as { id: string }).id,
      tierId: (tiers.body.data as Array<{ id: string }>)[0]!.id,
      campaignId: (campaign.body as { id: string }).id,
      customerId: customer.id,
      rewardId: reward.id,
      redemptionId: redemption.id,
    };

    attackerCustomer = await createCustomer(attacker);
    attackerReward = await createReward(attacker, { pointsCost: 1 });
    await givePoints(attacker, attackerCustomer.id, 100);
  });

  afterAll(async () => {
    await t.close();
  });

  async function send(probe: Probe, ids: Ids) {
    const req = attacker.client.agent[probe.method](fill(probe.route, ids)).set(
      'X-Requested-With',
      'XMLHttpRequest',
    );
    if (probe.route.endsWith('/purchases')) req.set('Idempotency-Key', randomUUID());
    return probe.body ? req.send(probe.body(ids)) : req;
  }

  describe("1. another tenant's id in the URL", () => {
    it.each(PROBES.map((p) => [label(p), p] as const))('%s → 404', async (_name, probe) => {
      const res = await send(probe, victimIds);
      expect(res.status).toBe(404);
      expect(res.body.title).toBe('Not Found');
    });
  });

  describe("2. own tenant, another tenant's resource ids in the path", () => {
    const nested = PROBES.filter((p) => p.route.replace(T, '').includes('{'));

    it.each(nested.map((p) => [label(p), p] as const))('%s → 404', async (_name, probe) => {
      const res = await send(probe, { ...victimIds, tenantId: attacker.tenantId });
      expect(res.status).toBe(404);
    });
  });

  describe("3. own tenant, another tenant's ids in the body", () => {
    const own = () => ({ ...victimIds, tenantId: attacker.tenantId });

    it('cannot record a purchase for their customer', async () => {
      const probe = PROBES.find((p) => p.route.endsWith('/purchases'))!;
      expect((await send(probe, own())).status).toBe(404);
    });

    it('cannot redeem their reward or for their customer', async () => {
      const route = `${T}/redemptions`;
      const theirReward = {
        method: 'post' as const,
        route,
        body: () => ({ customerId: attackerCustomer.id, rewardId: victimIds.rewardId }),
      };
      const theirCustomer = {
        method: 'post' as const,
        route,
        body: () => ({ customerId: victimIds.customerId, rewardId: attackerReward.id }),
      };
      expect((await send(theirReward, own())).status).toBe(404);
      expect((await send(theirCustomer, own())).status).toBe(404);
    });

    it('cannot include their customers in a bulk action', async () => {
      const probe = PROBES.find((p) => p.route.endsWith('/customers/bulk'))!;
      expect((await send(probe, own())).status).toBe(404);
    });
  });

  it('answers a non-existent tenant exactly like a foreign one', async () => {
    const foreign = await attacker.client.get(`/tenants/${victim.tenantId}`);
    const missing = await attacker.client.get(`/tenants/${randomUUID()}`);
    const malformed = await attacker.client.get('/tenants/not-a-uuid');
    for (const res of [foreign, missing, malformed]) {
      expect(res.status).toBe(404);
      expect(res.body.detail).toBe(foreign.body.detail);
    }
  });

  it("left the victim's data untouched", async () => {
    const v = `/tenants/${victim.tenantId}`;
    expect((await victim.client.get(v).expect(200)).body.name).toBe('Victim Co');
    const members = await victim.client.get(`${v}/members`).expect(200);
    expect(members.body.data).toEqual([expect.objectContaining({ role: 'OWNER' })]);
    const customer = await victim.client.get(`${v}/customers/${victimIds.customerId}`).expect(200);
    expect(customer.body).toMatchObject({ name: 'Victim Customer', pointsBalance: 90 });
    const program = await victim.client.get(`${v}/program`).expect(200);
    expect(program.body.pointsPerCurrencyUnit).toBe('1');
    const pending = await victim.client.get(`${v}/redemptions?status=PENDING`).expect(200);
    expect(pending.body.data).toHaveLength(1);
    await victim.client.get(`${v}/rewards/${victimIds.rewardId}`).expect(200);
    await victim.client.get(`${v}/tiers`).expect(200);
    expect(t.mailbox.messages.some((m) => m.to === 'intruder@example.test')).toBe(false);
  });

  it('covers every tenant-scoped route in the API', async () => {
    const doc = await request(t.app.getHttpServer()).get('/api/docs-json').expect(200);
    const paths = doc.body.paths as Record<string, Record<string, unknown>>;

    const routes = Object.entries(paths)
      .filter(([path]) => path.includes('{tenantId}'))
      .flatMap(([path, ops]) => Object.keys(ops).map((method) => `${method} ${path}`));
    const covered = new Set(PROBES.map((p) => `${p.method} ${p.route}`));

    expect(routes.filter((r) => !covered.has(r))).toEqual([]);
  });
});
