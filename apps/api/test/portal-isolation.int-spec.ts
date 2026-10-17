import type { PortalMe } from '@pointshub/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiClient, type Owner, registerOwner, TEST_PASSWORD } from './support/api-client';
import {
  businessSlug,
  createReward,
  givePoints,
  joinPortal,
  PORTAL_PASSWORD_LINK,
  type PortalCustomer,
} from './support/fixtures';
import { createTestApp, type TestApp } from './support/test-app';

/**
 * Portal isolation suite.
 *
 * A customer belongs to one business. Their session, refresh token and password links must
 * be worthless at any other business's portal, and ids of another business's rewards must
 * not be redeemable from their own. Business slugs are public, so a foreign portal answers
 * 401 (you are not signed in here) rather than pretending not to exist.
 *
 * The last test reads the OpenAPI document and fails if a portal route exists that this
 * suite does not cover.
 */

const P = '/api/v1/portal/{tenantSlug}';

/** Routes that need a customer session. */
const SESSION_ROUTES: Array<{ method: 'get' | 'post'; route: string; body?: object }> = [
  { method: 'get', route: `${P}/me` },
  { method: 'get', route: `${P}/me/ledger` },
  { method: 'get', route: `${P}/me/redemptions` },
  { method: 'get', route: `${P}/rewards` },
  { method: 'post', route: `${P}/redemptions`, body: { rewardId: randomUUID() } },
];

/** Routes used before signing in; each has a dedicated test below. */
const PUBLIC_ROUTES = [
  `get ${P}`,
  `post ${P}/auth/register`,
  `post ${P}/auth/login`,
  `post ${P}/auth/refresh`,
  `post ${P}/auth/logout`,
  `post ${P}/auth/forgot-password`,
  `post ${P}/auth/set-password`,
];

const cookie = (res: { headers: Record<string, unknown> }, name: string) =>
  ([] as string[])
    .concat((res.headers['set-cookie'] as string[] | undefined) ?? [])
    .find((c) => c.startsWith(`${name}=`))!
    .split(';')[0]!;

describe('Portal isolation', () => {
  let t: TestApp;
  let home: Owner;
  let victim: Owner;
  let homeSlug: string;
  let victimSlug: string;
  let member: PortalCustomer;
  let accessCookie: string;

  beforeAll(async () => {
    t = await createTestApp();
    home = await registerOwner(t.app, 'Home Café');
    victim = await registerOwner(t.app, 'Victim Café');
    [homeSlug, victimSlug] = await Promise.all([businessSlug(home), businessSlug(victim)]);

    member = await joinPortal(t, homeSlug);
    await givePoints(home, member.customerId, 1000);
    const login = await new ApiClient(t.app)
      .post(`/portal/${homeSlug}/auth/login`, { email: member.email, password: TEST_PASSWORD })
      .expect(200);
    accessCookie = cookie(login, 'ph_portal_access');
  });

  afterAll(async () => {
    await t.close();
  });

  /** Sends the home customer's cookies explicitly, as a malicious client would. */
  const raw = (method: 'get' | 'post', path: string, cookies: string) =>
    request(t.app.getHttpServer())
      [method](path)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookies);

  describe("a customer's session at another business's portal", () => {
    it.each(SESSION_ROUTES.map((r) => [`${r.method.toUpperCase()} ${r.route}`, r] as const))(
      '%s → 401',
      async (_name, probe) => {
        const path = probe.route.replace('{tenantSlug}', victimSlug);
        const req = raw(probe.method, path, accessCookie);
        const res = await (probe.body ? req.send(probe.body) : req);
        expect(res.status).toBe(401);
      },
    );

    it('works at their own portal (the probe is valid)', async () => {
      const res = await raw('get', `/api/v1/portal/${homeSlug}/me`, accessCookie).expect(200);
      expect((res.body as PortalMe).customer.id).toBe(member.customerId);
    });
  });

  it("cannot redeem another business's reward from their own portal", async () => {
    const theirs = await createReward(victim, { pointsCost: 1, stock: 3 });
    await member.client
      .post(`/portal/${homeSlug}/redemptions`, { rewardId: theirs.id })
      .expect(404);
    const after = await victim.client
      .get(`/tenants/${victim.tenantId}/rewards/${theirs.id}`)
      .expect(200);
    expect(after.body.stock).toBe(3);
  });

  it("does not list another business's rewards", async () => {
    const theirs = await createReward(victim, { name: 'Victim only' });
    const res = await member.client.get(`/portal/${homeSlug}/rewards?limit=100`).expect(200);
    expect((res.body.data as Array<{ id: string }>).map((r) => r.id)).not.toContain(theirs.id);
  });

  it('does not know the customer at another business', async () => {
    await new ApiClient(t.app)
      .post(`/portal/${victimSlug}/auth/login`, { email: member.email, password: TEST_PASSWORD })
      .expect(401);
  });

  it('does not refresh a session at another business', async () => {
    // Use a throwaway session: a rejected refresh token is consumed.
    const other = await joinPortal(t, homeSlug);
    const login = await new ApiClient(t.app)
      .post(`/portal/${homeSlug}/auth/login`, { email: other.email, password: TEST_PASSWORD })
      .expect(200);
    const stolen = cookie(login, 'ph_portal_refresh');
    await raw('post', `/api/v1/portal/${victimSlug}/auth/refresh`, stolen).expect(401);
  });

  it("does not accept one business's join link at another", async () => {
    const email = `joiner-${randomUUID().slice(0, 8)}@example.test`;
    await new ApiClient(t.app)
      .post(`/portal/${homeSlug}/auth/register`, { name: 'Joiner', email })
      .expect(202);
    const token = t.mailbox.tokenFor(email, PORTAL_PASSWORD_LINK);
    await new ApiClient(t.app)
      .post(`/portal/${victimSlug}/auth/set-password`, { token, password: TEST_PASSWORD })
      .expect(400);
    const created = await t.prisma.unscoped.customer.count({ where: { email } });
    expect(created).toBe(0);
  });

  it("does not accept one business's password link at another", async () => {
    await new ApiClient(t.app)
      .post(`/portal/${homeSlug}/auth/forgot-password`, { email: member.email })
      .expect(202);
    const token = t.mailbox.tokenFor(member.email, PORTAL_PASSWORD_LINK);
    await new ApiClient(t.app)
      .post(`/portal/${victimSlug}/auth/set-password`, { token, password: 'hijacked password!!' })
      .expect(400);
  });

  it('registering the same email at another business creates a separate customer', async () => {
    const elsewhere = await joinPortal(t, victimSlug, member.email);
    expect(elsewhere.customerId).not.toBe(member.customerId);
    const me = await elsewhere.client.get(`/portal/${victimSlug}/me`).expect(200);
    expect(me.body.pointsBalance).toBe(0);
  });

  it('covers every portal route in the API', async () => {
    const doc = await request(t.app.getHttpServer()).get('/api/docs-json').expect(200);
    const paths = doc.body.paths as Record<string, Record<string, unknown>>;

    const routes = Object.entries(paths)
      .filter(([path]) => path.includes('{tenantSlug}'))
      .flatMap(([path, ops]) => Object.keys(ops).map((method) => `${method} ${path}`));
    const covered = new Set([
      ...SESSION_ROUTES.map((r) => `${r.method} ${r.route}`),
      ...PUBLIC_ROUTES,
    ]);

    expect(routes.filter((r) => !covered.has(r))).toEqual([]);
  });
});
