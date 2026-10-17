import type { PortalMe, PortalRedemption, ProblemDetails } from '@pointshub/shared';
import {
  ApiClient,
  type Owner,
  registerOwner,
  TEST_PASSWORD,
  uniqueEmail,
} from './support/api-client';
import {
  businessSlug,
  createCustomer,
  createReward,
  givePoints,
  joinPortal,
  PORTAL_PASSWORD_LINK,
  recordPurchase,
} from './support/fixtures';
import { createTestApp, type TestApp } from './support/test-app';

const NEW_PASSWORD = 'a brand new portal password';

const cookiesOf = (res: { headers: Record<string, unknown> }) =>
  ([] as string[]).concat((res.headers['set-cookie'] as string[] | undefined) ?? []);

describe('Customer portal', () => {
  let t: TestApp;
  let owner: Owner;
  let slug: string;
  let base: string;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await registerOwner(t.app, 'Portal Bakery');
    slug = await businessSlug(owner);
    base = `/portal/${slug}`;
  });

  afterAll(async () => {
    await t.close();
  });

  const client = () => new ApiClient(t.app);

  describe('business details', () => {
    it('are public', async () => {
      const res = await client().get(base).expect(200);
      expect(res.body).toEqual({
        name: 'Portal Bakery',
        slug,
        currency: 'GBP',
        pointsPerCurrencyUnit: '1',
      });
    });

    it('404 for an unknown or malformed slug', async () => {
      await client().get('/portal/no-such-business').expect(404);
      await client().get('/portal/Not_A_Slug!').expect(404);
    });
  });

  describe('registration', () => {
    it('enrols a new customer, signs them in, and shows them to the business', async () => {
      const email = uniqueEmail('new');
      const res = await client()
        .post(`${base}/auth/register`, { name: 'Nina New', email, password: TEST_PASSWORD })
        .expect(201);

      expect(res.body.status).toBe('SIGNED_IN');
      const me = res.body.me as PortalMe;
      expect(me).toMatchObject({
        customer: { name: 'Nina New', email },
        business: { name: 'Portal Bakery', slug },
        pointsBalance: 0,
        tier: { name: 'Bronze' },
      });
      expect(me.tiers.map((tier) => tier.name)).toEqual(['Bronze', 'Silver', 'Gold']);

      const cookies = cookiesOf(res);
      const access = cookies.find((c) => c.startsWith('ph_portal_access='))!;
      const refresh = cookies.find((c) => c.startsWith('ph_portal_refresh='))!;
      expect(access).toContain(`Path=/api/v1/portal/${slug};`);
      expect(refresh).toContain(`Path=/api/v1/portal/${slug}/auth;`);
      expect(cookies.every((c) => c.includes('HttpOnly'))).toBe(true);

      const listed = await owner.client
        .get(`/tenants/${owner.tenantId}/customers?q=${encodeURIComponent(email)}`)
        .expect(200);
      expect(listed.body.data).toEqual([expect.objectContaining({ id: me.customer.id })]);

      const event = await t.prisma.unscoped.outboxEvent.findFirst({
        where: { tenantId: owner.tenantId, type: 'customer.created' },
        orderBy: { occurredAt: 'desc' },
      });
      expect(event?.payload).toMatchObject({ customerId: me.customer.id });
    });

    it('lets a customer enrolled at the counter claim their account by email only', async () => {
      const enrolled = await createCustomer(owner, { name: 'Cora Counter' });
      await givePoints(owner, enrolled.id, 40);

      // Someone registers with Cora's email: no session, and the password is not set.
      const intruder = client();
      const res = await intruder
        .post(`${base}/auth/register`, {
          name: 'Not Cora',
          email: enrolled.email,
          password: TEST_PASSWORD,
        })
        .expect(202);
      expect(res.body).toEqual({ status: 'CHECK_EMAIL' });
      expect(cookiesOf(res)).toEqual([]);
      await intruder.get(`${base}/me`).expect(401);
      await client()
        .post(`${base}/auth/login`, { email: enrolled.email, password: TEST_PASSWORD })
        .expect(401);

      // Cora follows the emailed link and is signed in to her existing account.
      const mail = t.mailbox.lastTo(enrolled.email);
      expect(mail.subject).toBe('Set up your Portal Bakery rewards account');
      const token = t.mailbox.tokenFor(enrolled.email, PORTAL_PASSWORD_LINK);
      const cora = client();
      const claimed = await cora
        .post(`${base}/auth/set-password`, { token, password: NEW_PASSWORD })
        .expect(200);
      expect(claimed.body).toMatchObject({
        customer: { id: enrolled.id, name: 'Cora Counter' },
        pointsBalance: 40,
      });
      await cora.get(`${base}/me`).expect(200);

      // The link works once.
      await client()
        .post(`${base}/auth/set-password`, { token, password: 'yet another password!' })
        .expect(400);
      await client()
        .post(`${base}/auth/login`, { email: enrolled.email, password: NEW_PASSWORD })
        .expect(200);
    });

    it('validates input', async () => {
      const res = await client()
        .post(`${base}/auth/register`, { name: '', email: 'nope', password: 'short' })
        .expect(400);
      const errors = (res.body as ProblemDetails).errors ?? [];
      expect(errors.map((e) => e.path).sort()).toEqual(['email', 'name', 'password']);
    });

    it('requires the CSRF header', async () => {
      await client()
        .agent.post(`/api/v1${base}/auth/register`)
        .send({ name: 'X', email: uniqueEmail(), password: TEST_PASSWORD })
        .expect(403);
    });
  });

  describe('sessions', () => {
    it('signs in with the right password only', async () => {
      const member = await joinPortal(t, slug);
      await client()
        .post(`${base}/auth/login`, { email: member.email, password: 'wrong password!!' })
        .expect(401);
      const res = await client()
        .post(`${base}/auth/login`, { email: member.email, password: TEST_PASSWORD })
        .expect(200);
      expect((res.body as PortalMe).customer.id).toBe(member.customerId);
    });

    it('rate-limits login attempts', async () => {
      const member = await joinPortal(t, slug);
      for (let i = 0; i < 5; i++) {
        await client()
          .post(`${base}/auth/login`, { email: member.email, password: 'wrong password!!' })
          .expect(401);
      }
      await client()
        .post(`${base}/auth/login`, { email: member.email, password: TEST_PASSWORD })
        .expect(429);
    });

    it('rotates refresh tokens and revokes the family on reuse', async () => {
      const member = await joinPortal(t, slug);
      const login = await client()
        .post(`${base}/auth/login`, { email: member.email, password: TEST_PASSWORD })
        .expect(200);
      const stolen = cookiesOf(login)
        .find((c) => c.startsWith('ph_portal_refresh='))!
        .split(';')[0]!;

      // The stolen token is used once (by its rightful owner, say) and then replayed.
      const replay = () =>
        client()
          .agent.post(`/api/v1${base}/auth/refresh`)
          .set('X-Requested-With', 'XMLHttpRequest')
          .set('Cookie', stolen);
      await replay().expect(204);
      await replay().expect(401);

      const active = await t.prisma.unscoped.refreshToken.count({
        where: { customerId: member.customerId, revokedAt: null },
      });
      // Only the session from joining is left; the stolen family is gone.
      expect(active).toBe(1);
    });

    it('logs out', async () => {
      const member = await joinPortal(t, slug);
      const res = await member.client.post(`${member.base}/auth/logout`).expect(204);
      expect(cookiesOf(res).some((c) => c.startsWith('ph_portal_access=;'))).toBe(true);
      await member.client.get(`${member.base}/me`).expect(401);
      await member.client.post(`${member.base}/auth/refresh`).expect(401);
    });

    it('resets a forgotten password and signs out other sessions', async () => {
      const member = await joinPortal(t, slug);
      await client().post(`${base}/auth/forgot-password`, { email: member.email }).expect(202);
      await client()
        .post(`${base}/auth/forgot-password`, { email: uniqueEmail('nobody') })
        .expect(202);

      expect(t.mailbox.lastTo(member.email).subject).toBe(
        'Reset your Portal Bakery rewards password',
      );
      const token = t.mailbox.tokenFor(member.email, PORTAL_PASSWORD_LINK);
      await client()
        .post(`${base}/auth/set-password`, { token, password: NEW_PASSWORD })
        .expect(200);

      await member.client.post(`${member.base}/auth/refresh`).expect(401);
      await client()
        .post(`${base}/auth/login`, { email: member.email, password: TEST_PASSWORD })
        .expect(401);
    });

    it('rejects merchant sessions on portal routes', async () => {
      await owner.client.get(`${base}/me`).expect(401);
    });

    it('rejects portal sessions on merchant routes', async () => {
      const member = await joinPortal(t, slug);
      await member.client.get('/auth/me').expect(401);
      await member.client.get(`/tenants/${owner.tenantId}/customers`).expect(401);
    });
  });

  describe('account', () => {
    it('shows balance, tier, history and the catalogue, and redeems', async () => {
      const member = await joinPortal(t, slug);
      await recordPurchase(owner.client, owner.tenantId, member.customerId, '600').expect(201);
      const reward = await createReward(owner, { name: 'Sourdough loaf', pointsCost: 250 });
      const retired = await createReward(owner, { name: 'Retired', pointsCost: 1, active: false });

      const me = (await member.client.get(`${member.base}/me`).expect(200)).body as PortalMe;
      expect(me).toMatchObject({
        pointsBalance: 600,
        lifetimePoints: 600,
        tier: { name: 'Silver' },
      });

      const catalogue = await member.client.get(`${member.base}/rewards`).expect(200);
      const ids = (catalogue.body.data as Array<{ id: string }>).map((r) => r.id);
      expect(ids).toContain(reward.id);
      expect(ids).not.toContain(retired.id);

      const redeemed = await member.client
        .post(`${member.base}/redemptions`, { rewardId: reward.id })
        .expect(201);
      const redemption = redeemed.body as PortalRedemption;
      expect(redemption).toMatchObject({ status: 'PENDING', pointsSpent: 250 });
      expect(redemption.code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
      expect(redemption).not.toHaveProperty('customer');

      // Staff hand it over; the customer sees it fulfilled.
      await owner.client
        .post(`/tenants/${owner.tenantId}/redemptions/${redemption.id}/fulfil`)
        .expect(200);
      const history = await member.client.get(`${member.base}/me/redemptions`).expect(200);
      expect(history.body.data).toEqual([
        expect.objectContaining({ id: redemption.id, status: 'FULFILLED' }),
      ]);

      const ledger = await member.client.get(`${member.base}/me/ledger`).expect(200);
      expect(
        (ledger.body.data as Array<{ type: string; points: number }>).map((e) => [
          e.type,
          e.points,
        ]),
      ).toEqual([
        ['REDEEM', -250],
        ['EARN', 600],
      ]);
      expect(((await member.client.get(`${member.base}/me`)).body as PortalMe).pointsBalance).toBe(
        350,
      );
    });

    it('refuses redemptions beyond the balance or of inactive rewards', async () => {
      const member = await joinPortal(t, slug);
      const pricey = await createReward(owner, { pointsCost: 1000 });
      const retired = await createReward(owner, { pointsCost: 1, active: false });

      const short = await member.client
        .post(`${member.base}/redemptions`, { rewardId: pricey.id })
        .expect(409);
      expect(short.body.type).toBe('/problems/insufficient-points');
      await member.client.post(`${member.base}/redemptions`, { rewardId: retired.id }).expect(409);
    });

    it('paginates history', async () => {
      const member = await joinPortal(t, slug);
      for (let i = 0; i < 3; i++) {
        await recordPurchase(owner.client, owner.tenantId, member.customerId, '1').expect(201);
      }
      const first = await member.client.get(`${member.base}/me/ledger?limit=2`).expect(200);
      expect(first.body.data).toHaveLength(2);
      expect(first.body.pageInfo.hasNextPage).toBe(true);
      const second = await member.client
        .get(`${member.base}/me/ledger?limit=2&cursor=${first.body.pageInfo.nextCursor}`)
        .expect(200);
      expect(second.body.data).toHaveLength(1);
    });
  });
});
