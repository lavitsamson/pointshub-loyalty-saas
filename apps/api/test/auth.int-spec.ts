import type { MeResponse } from '@pointshub/shared';
import { ApiClient, registerOwner, TEST_PASSWORD, uniqueEmail } from './support/api-client';
import { createTestApp, type TestApp } from './support/test-app';

const RESET_LINK = /reset-password\?token=([^\s]+)/;

describe('Auth', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  const client = () => new ApiClient(t.app);

  function cookieNames(setCookie: string | string[] | undefined): string[] {
    return ([] as string[]).concat(setCookie ?? []).map((c) => c.split('=')[0]!);
  }

  describe('POST /auth/register', () => {
    it('creates the owner, business, default programme and tiers, and signs in', async () => {
      const email = uniqueEmail('reg');
      const res = await client()
        .post('/auth/register', {
          name: 'Ada',
          email: email.toUpperCase(),
          password: TEST_PASSWORD,
          businessName: 'Bean & Brew Café',
          currency: 'eur',
        })
        .expect(201);

      const me = res.body as MeResponse;
      expect(me.user.email).toBe(email);
      expect(me.memberships).toEqual([
        expect.objectContaining({ role: 'OWNER', tenantName: 'Bean & Brew Café' }),
      ]);
      expect(me.memberships[0]!.tenantSlug).toMatch(/^bean-and-brew-cafe/);

      const setCookie = res.headers['set-cookie'] as unknown as string[];
      expect(cookieNames(setCookie)).toEqual(['ph_access', 'ph_refresh']);
      expect(setCookie.every((c) => c.includes('HttpOnly') && c.includes('SameSite=Lax'))).toBe(
        true,
      );
      expect(setCookie[1]).toContain('Path=/api/v1/auth');

      const tenantId = me.memberships[0]!.tenantId;
      const program = await t.prisma.unscoped.loyaltyProgram.findUnique({ where: { tenantId } });
      expect(program?.currency).toBe('EUR');
      const tiers = await t.prisma.unscoped.tier.findMany({
        where: { tenantId },
        orderBy: { sortOrder: 'asc' },
      });
      expect(tiers.map((tier) => [tier.name, tier.minLifetimePoints])).toEqual([
        ['Bronze', 0],
        ['Silver', 500],
        ['Gold', 1500],
      ]);
    });

    it('never stores or returns the plain password', async () => {
      const email = uniqueEmail('hash');
      const res = await client()
        .post('/auth/register', { name: 'A', email, password: TEST_PASSWORD, businessName: 'Biz' })
        .expect(201);
      expect(JSON.stringify(res.body)).not.toContain('password');

      const user = await t.prisma.unscoped.user.findUniqueOrThrow({ where: { email } });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('rejects an email that is already registered', async () => {
      const owner = await registerOwner(t.app);
      const res = await client()
        .post('/auth/register', {
          name: 'Again',
          email: owner.email,
          password: TEST_PASSWORD,
          businessName: 'Other',
        })
        .expect(409);
      expect(res.body).toMatchObject({ type: '/problems/email-taken', status: 409 });
    });

    it('enforces the password policy with a field-level error', async () => {
      const res = await client()
        .post('/auth/register', {
          name: 'A',
          email: uniqueEmail(),
          password: 'short',
          businessName: 'Biz',
        })
        .expect(400);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ path: 'password', message: expect.stringContaining('12') }),
      ]);
    });

    it('gives clashing business names distinct slugs', async () => {
      const a = await registerOwner(t.app, 'Slug Clash Bakery');
      const b = await registerOwner(t.app, 'Slug Clash Bakery');
      const slugs = await t.prisma.unscoped.tenant.findMany({
        where: { id: { in: [a.tenantId, b.tenantId] } },
        select: { slug: true },
      });
      expect(new Set(slugs.map((s) => s.slug)).size).toBe(2);
    });
  });

  describe('POST /auth/login', () => {
    it('signs in with the right password', async () => {
      const owner = await registerOwner(t.app);
      const c = client();
      await c.post('/auth/login', { email: owner.email, password: TEST_PASSWORD }).expect(200);
      const me = await c.get('/auth/me').expect(200);
      expect((me.body as MeResponse).user.id).toBe(owner.userId);
    });

    it('gives the same answer for a wrong password and an unknown email', async () => {
      const owner = await registerOwner(t.app);
      const wrong = await client()
        .post('/auth/login', { email: owner.email, password: 'wrong password!!' })
        .expect(401);
      const unknown = await client()
        .post('/auth/login', { email: uniqueEmail('nobody'), password: 'wrong password!!' })
        .expect(401);
      expect(wrong.body.detail).toBe(unknown.body.detail);
    });

    it('rate-limits repeated attempts for the same email', async () => {
      const owner = await registerOwner(t.app);
      for (let i = 0; i < 5; i++) {
        await client()
          .post('/auth/login', { email: owner.email, password: 'wrong password!!' })
          .expect(401);
      }
      const limited = await client()
        .post('/auth/login', { email: owner.email, password: TEST_PASSWORD })
        .expect(429);
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
      expect(limited.body.type).toBe('/problems/rate-limited');
    });
  });

  describe('session handling', () => {
    it('requires a session for protected routes', async () => {
      const res = await client().get('/auth/me').expect(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it('rejects state-changing requests without the CSRF header', async () => {
      const res = await client()
        .agent.post('/api/v1/auth/login')
        .send({ email: uniqueEmail(), password: TEST_PASSWORD })
        .expect(403);
      expect(res.body.detail).toContain('X-Requested-With');
    });

    it('rotates the refresh token on every refresh', async () => {
      const owner = await registerOwner(t.app);
      const first = await owner.client.post('/auth/refresh').expect(204);
      const second = await owner.client.post('/auth/refresh').expect(204);
      const tokenOf = (res: typeof first) =>
        ([] as string[])
          .concat(res.headers['set-cookie'] ?? [])
          .find((c) => c.startsWith('ph_refresh='));
      expect(tokenOf(first)).toBeDefined();
      expect(tokenOf(first)).not.toEqual(tokenOf(second));
      await owner.client.get('/auth/me').expect(200);
    });

    it('revokes the whole token family when a used refresh token is replayed', async () => {
      const victim = client();
      const email = uniqueEmail('victim');
      const registered = await victim
        .post('/auth/register', {
          name: 'V',
          email,
          password: TEST_PASSWORD,
          businessName: 'Victim Cafe',
        })
        .expect(201);
      // An attacker copies the refresh cookie...
      const stolenCookie = ([] as string[])
        .concat(registered.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith('ph_refresh='))!
        .split(';')[0]!;

      // ...the victim keeps using the app, which consumes that token...
      await victim.post('/auth/refresh').expect(204);

      // ...and when the attacker replays it, the reuse is detected and rejected...
      const attacker = client();
      await attacker.agent
        .post('/api/v1/auth/refresh')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', stolenCookie)
        .expect(401);

      // ...and the victim's current token is revoked too, forcing a fresh login.
      await victim.post('/auth/refresh').expect(401);
    });

    it('logs out by revoking the session and clearing cookies', async () => {
      const owner = await registerOwner(t.app);
      const res = await owner.client.post('/auth/logout').expect(204);
      const cleared = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
      expect(cleared.some((c) => c.startsWith('ph_access=;'))).toBe(true);

      await owner.client.get('/auth/me').expect(401);
      await owner.client.post('/auth/refresh').expect(401);
      const active = await t.prisma.unscoped.refreshToken.count({
        where: { userId: owner.userId, revokedAt: null },
      });
      expect(active).toBe(0);
    });
  });

  describe('password reset', () => {
    it('emails a single-use link that sets a new password and signs out other sessions', async () => {
      const owner = await registerOwner(t.app);
      await client().post('/auth/forgot-password', { email: owner.email }).expect(202);
      const token = t.mailbox.tokenFor(owner.email, RESET_LINK);

      const newPassword = 'a brand new passphrase';
      await client().post('/auth/reset-password', { token, password: newPassword }).expect(204);

      // Existing sessions are revoked.
      await owner.client.post('/auth/refresh').expect(401);
      // The old password no longer works; the new one does.
      await client()
        .post('/auth/login', { email: owner.email, password: TEST_PASSWORD })
        .expect(401);
      await client().post('/auth/login', { email: owner.email, password: newPassword }).expect(200);
      // The link cannot be used twice.
      const reused = await client()
        .post('/auth/reset-password', { token, password: 'yet another passphrase' })
        .expect(400);
      expect(reused.body.type).toBe('/problems/invalid-reset-token');
    });

    it('answers the same for unknown emails and sends nothing', async () => {
      const email = uniqueEmail('ghost');
      await client().post('/auth/forgot-password', { email }).expect(202);
      expect(t.mailbox.messages.some((m) => m.to === email)).toBe(false);
    });

    it('rejects a tampered token', async () => {
      await client()
        .post('/auth/reset-password', { token: 'abc.def.ghi', password: 'whatever passphrase' })
        .expect(400);
    });
  });

  it('records registration in the audit log', async () => {
    const owner = await registerOwner(t.app);
    const res = await owner.client.get(`/tenants/${owner.tenantId}/audit-logs`).expect(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ action: 'tenant.created', actorUserId: owner.userId }),
    ]);
  });
});
