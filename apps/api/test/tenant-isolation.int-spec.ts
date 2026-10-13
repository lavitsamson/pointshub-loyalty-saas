import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { type Owner, registerOwner, uniqueEmail } from './support/api-client';
import { createTestApp, type TestApp } from './support/test-app';

/**
 * Tenant isolation suite.
 *
 * Owner A attacks tenant B through every tenant-scoped endpoint, and must always get 404:
 * the API must neither leak B's data nor confirm that B exists. Requests are made as an
 * OWNER, the most privileged role, so a pass here is not explained by a permission check.
 *
 * The final test reads the OpenAPI document and fails if a tenant-scoped route exists that
 * this suite does not cover, so new endpoints cannot skip isolation testing.
 */

type Method = 'get' | 'post' | 'patch' | 'delete';

interface Probe {
  method: Method;
  /** Path template as it appears in the OpenAPI document. */
  route: string;
  body?: object;
}

/** Ids of resources that really exist in tenant B, filled in beforeAll. */
interface VictimIds {
  tenantId: string;
  userId: string;
  invitationId: string;
}

const PROBES: Probe[] = [
  { method: 'get', route: '/api/v1/tenants/{tenantId}' },
  { method: 'patch', route: '/api/v1/tenants/{tenantId}', body: { name: 'Pwned' } },
  { method: 'get', route: '/api/v1/tenants/{tenantId}/members' },
  {
    method: 'patch',
    route: '/api/v1/tenants/{tenantId}/members/{userId}',
    body: { role: 'ADMIN' },
  },
  { method: 'delete', route: '/api/v1/tenants/{tenantId}/members/{userId}' },
  {
    method: 'post',
    route: '/api/v1/tenants/{tenantId}/invitations',
    body: { email: 'intruder@example.test', role: 'ADMIN' },
  },
  { method: 'get', route: '/api/v1/tenants/{tenantId}/invitations' },
  { method: 'delete', route: '/api/v1/tenants/{tenantId}/invitations/{invitationId}' },
  { method: 'get', route: '/api/v1/tenants/{tenantId}/audit-logs' },
];

function fill(route: string, ids: VictimIds): string {
  return route
    .replace('{tenantId}', ids.tenantId)
    .replace('{userId}', ids.userId)
    .replace('{invitationId}', ids.invitationId);
}

describe('Tenant isolation', () => {
  let t: TestApp;
  let attacker: Owner;
  let victim: Owner;
  let victimIds: VictimIds;

  beforeAll(async () => {
    t = await createTestApp();
    attacker = await registerOwner(t.app, 'Attacker Co');
    victim = await registerOwner(t.app, 'Victim Co');
    const invitation = await victim.client
      .post(`/tenants/${victim.tenantId}/invitations`, { email: uniqueEmail(), role: 'STAFF' })
      .expect(201);
    victimIds = {
      tenantId: victim.tenantId,
      userId: victim.userId,
      invitationId: (invitation.body as { id: string }).id,
    };
  });

  afterAll(async () => {
    await t.close();
  });

  async function send(probe: Probe, path: string) {
    const req = attacker.client.agent[probe.method](path).set('X-Requested-With', 'XMLHttpRequest');
    return probe.body ? req.send(probe.body) : req;
  }

  describe("using another tenant's id", () => {
    it.each(PROBES.map((p) => [`${p.method.toUpperCase()} ${p.route}`, p] as const))(
      '%s → 404',
      async (_name, probe) => {
        const res = await send(probe, fill(probe.route, victimIds));
        expect(res.status).toBe(404);
        expect(res.body.title).toBe('Not Found');
      },
    );
  });

  describe("using the attacker's own tenant with the victim's resource ids", () => {
    const nested = PROBES.filter((p) => /\{(userId|invitationId)\}/.test(p.route));

    it.each(nested.map((p) => [`${p.method.toUpperCase()} ${p.route}`, p] as const))(
      '%s → 404',
      async (_name, probe) => {
        const res = await send(
          probe,
          fill(probe.route, { ...victimIds, tenantId: attacker.tenantId }),
        );
        expect(res.status).toBe(404);
      },
    );
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
    const tenant = await victim.client.get(`/tenants/${victim.tenantId}`).expect(200);
    expect(tenant.body.name).toBe('Victim Co');
    const members = await victim.client.get(`/tenants/${victim.tenantId}/members`).expect(200);
    expect(members.body.data).toEqual([expect.objectContaining({ role: 'OWNER' })]);
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
