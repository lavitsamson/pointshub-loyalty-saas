import type { Invitation, Member, MeResponse } from '@pointshub/shared';
import {
  ApiClient,
  type Owner,
  registerOwner,
  TEST_PASSWORD,
  uniqueEmail,
} from './support/api-client';
import { addMember as addMemberTo } from './support/fixtures';
import { createTestApp, type TestApp } from './support/test-app';

const INVITE_LINK = /\/invite\/([^\s]+)/;

describe('Team and invitations', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  const addMember = (owner: Owner, role: 'ADMIN' | 'STAFF') => addMemberTo(t, owner, role);

  describe('invitations', () => {
    it('lets a new person create an account from the emailed link', async () => {
      const owner = await registerOwner(t.app, 'Invite Cafe');
      const staff = await addMember(owner, 'STAFF');

      const email = t.mailbox.lastTo(staff.email);
      expect(email.subject).toContain('Invite Cafe');

      const me = (await staff.client.get('/auth/me').expect(200)).body as MeResponse;
      expect(me.memberships).toEqual([
        expect.objectContaining({ tenantId: owner.tenantId, role: 'STAFF' }),
      ]);

      const members = await owner.client.get(`/tenants/${owner.tenantId}/members`).expect(200);
      expect((members.body.data as Member[]).map((m) => m.role).sort()).toEqual(['OWNER', 'STAFF']);
    });

    it('is single-use', async () => {
      const owner = await registerOwner(t.app);
      const staff = await addMember(owner, 'STAFF');
      const again = await new ApiClient(t.app)
        .post(`/invitations/${staff.token}/accept`, { name: 'X', password: TEST_PASSWORD })
        .expect(410);
      expect(again.body.type).toBe('/problems/invitation-unavailable');
    });

    it('cannot be reused to rejoin after being removed', async () => {
      const owner = await registerOwner(t.app);
      const staff = await addMember(owner, 'STAFF');
      await owner.client.delete(`/tenants/${owner.tenantId}/members/${staff.userId}`).expect(204);
      await staff.client
        .post(`/invitations/${staff.token}/accept`, { password: TEST_PASSWORD })
        .expect(410);
    });

    it('adds an existing user after they prove their password', async () => {
      const owner = await registerOwner(t.app);
      const other = await registerOwner(t.app);
      await owner.client
        .post(`/tenants/${owner.tenantId}/invitations`, { email: other.email, role: 'ADMIN' })
        .expect(201);
      const token = t.mailbox.tokenFor(other.email, INVITE_LINK);

      await new ApiClient(t.app)
        .post(`/invitations/${token}/accept`, { password: 'not their password' })
        .expect(401);
      const res = await new ApiClient(t.app)
        .post(`/invitations/${token}/accept`, { password: TEST_PASSWORD })
        .expect(200);

      const roles = (res.body as MeResponse).memberships.map((m) => m.role).sort();
      expect(roles).toEqual(['ADMIN', 'OWNER']);
    });

    it('requires a name and a policy-compliant password for new accounts', async () => {
      const owner = await registerOwner(t.app);
      const email = uniqueEmail();
      await owner.client
        .post(`/tenants/${owner.tenantId}/invitations`, { email, role: 'STAFF' })
        .expect(201);
      const token = t.mailbox.tokenFor(email, INVITE_LINK);
      const res = await new ApiClient(t.app)
        .post(`/invitations/${token}/accept`, { password: 'short' })
        .expect(400);
      expect((res.body.errors as Array<{ path: string }>).map((e) => e.path).sort()).toEqual([
        'name',
        'password',
      ]);
    });

    it('rejects inviting someone who is already a member', async () => {
      const owner = await registerOwner(t.app);
      await owner.client
        .post(`/tenants/${owner.tenantId}/invitations`, { email: owner.email, role: 'ADMIN' })
        .expect(409);
    });

    it('can be withdrawn before it is accepted', async () => {
      const owner = await registerOwner(t.app);
      const email = uniqueEmail();
      const created = await owner.client
        .post(`/tenants/${owner.tenantId}/invitations`, { email, role: 'STAFF' })
        .expect(201);
      const invitation = created.body as Invitation;

      const pending = await owner.client.get(`/tenants/${owner.tenantId}/invitations`).expect(200);
      expect((pending.body.data as Invitation[]).map((i) => i.id)).toEqual([invitation.id]);

      await owner.client
        .delete(`/tenants/${owner.tenantId}/invitations/${invitation.id}`)
        .expect(204);
      await new ApiClient(t.app)
        .post(`/invitations/${t.mailbox.tokenFor(email, INVITE_LINK)}/accept`, {
          name: 'Late',
          password: TEST_PASSWORD,
        })
        .expect(410);
    });

    it('rejects a forged token', async () => {
      await new ApiClient(t.app)
        .post('/invitations/forged.token.value/accept', { name: 'X', password: TEST_PASSWORD })
        .expect(410);
      await new ApiClient(t.app).get('/invitations/forged.token.value').expect(410);
    });

    it('can be previewed by the link holder until it is used', async () => {
      const owner = await registerOwner(t.app, 'Preview Bakery');
      const other = await registerOwner(t.app);
      const newcomer = uniqueEmail();
      for (const email of [newcomer, other.email]) {
        await owner.client
          .post(`/tenants/${owner.tenantId}/invitations`, { email, role: 'STAFF' })
          .expect(201);
      }
      const anonymous = new ApiClient(t.app);

      const fresh = await anonymous
        .get(`/invitations/${t.mailbox.tokenFor(newcomer, INVITE_LINK)}`)
        .expect(200);
      expect(fresh.body).toEqual({
        tenantName: 'Preview Bakery',
        email: newcomer,
        role: 'STAFF',
        hasAccount: false,
        expiresAt: expect.any(String),
      });

      const existingToken = t.mailbox.tokenFor(other.email, INVITE_LINK);
      const existing = await anonymous.get(`/invitations/${existingToken}`).expect(200);
      expect(existing.body).toMatchObject({ email: other.email, hasAccount: true });

      await anonymous
        .post(`/invitations/${existingToken}/accept`, { password: TEST_PASSWORD })
        .expect(200);
      await anonymous.get(`/invitations/${existingToken}`).expect(410);
    });
  });

  describe('roles and permissions', () => {
    it('lets staff read but not manage', async () => {
      const owner = await registerOwner(t.app);
      const staff = await addMember(owner, 'STAFF');
      const base = `/tenants/${owner.tenantId}`;

      await staff.client.get(base).expect(200);
      await staff.client.get(`${base}/members`).expect(200);
      await staff.client.patch(base, { name: 'Renamed' }).expect(403);
      await staff.client
        .post(`${base}/invitations`, { email: uniqueEmail(), role: 'STAFF' })
        .expect(403);
      await staff.client.get(`${base}/audit-logs`).expect(403);
    });

    it('lets admins manage staff but never owners', async () => {
      const owner = await registerOwner(t.app);
      const admin = await addMember(owner, 'ADMIN');
      const staff = await addMember(owner, 'STAFF');
      const base = `/tenants/${owner.tenantId}/members`;

      await admin.client.patch(`${base}/${staff.userId}`, { role: 'ADMIN' }).expect(200);
      await admin.client.patch(`${base}/${owner.userId}`, { role: 'STAFF' }).expect(403);
      await admin.client.delete(`${base}/${owner.userId}`).expect(403);
    });

    it('applies role changes immediately, without a new login', async () => {
      const owner = await registerOwner(t.app);
      const staff = await addMember(owner, 'STAFF');
      const base = `/tenants/${owner.tenantId}`;

      await staff.client.get(`${base}/audit-logs`).expect(403);
      await owner.client.patch(`${base}/members/${staff.userId}`, { role: 'ADMIN' }).expect(200);
      await staff.client.get(`${base}/audit-logs`).expect(200);
    });

    it('cuts off removed members immediately', async () => {
      const owner = await registerOwner(t.app);
      const staff = await addMember(owner, 'STAFF');
      await owner.client.delete(`/tenants/${owner.tenantId}/members/${staff.userId}`).expect(204);
      await staff.client.get(`/tenants/${owner.tenantId}`).expect(404);
    });

    it('never leaves a business without an owner', async () => {
      const owner = await registerOwner(t.app);
      const res = await owner.client
        .delete(`/tenants/${owner.tenantId}/members/${owner.userId}`)
        .expect(409);
      expect(res.body.type).toBe('/problems/last-owner');
    });

    it('keeps an owner when two owners leave at the same moment', async () => {
      const owner = await registerOwner(t.app);
      const second = await addMember(owner, 'ADMIN');
      // Owners are never invited; a second owner is promoted directly.
      await t.prisma.unscoped.membership.update({
        where: { userId_tenantId: { userId: second.userId, tenantId: owner.tenantId } },
        data: { role: 'OWNER' },
      });

      const results = await Promise.all([
        owner.client.delete(`/tenants/${owner.tenantId}/members/${owner.userId}`),
        second.client.delete(`/tenants/${owner.tenantId}/members/${second.userId}`),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
      const owners = await t.prisma.unscoped.membership.count({
        where: { tenantId: owner.tenantId, role: 'OWNER' },
      });
      expect(owners).toBe(1);
    });

    it('lets a staff member leave on their own', async () => {
      const owner = await registerOwner(t.app);
      const staff = await addMember(owner, 'STAFF');
      await staff.client.delete(`/tenants/${owner.tenantId}/members/${staff.userId}`).expect(204);
    });
  });

  describe('tenant details and audit log', () => {
    it('records admin changes with before and after values', async () => {
      const owner = await registerOwner(t.app, 'Before Name');
      const base = `/tenants/${owner.tenantId}`;
      const updated = await owner.client.patch(base, { name: 'After Name' }).expect(200);
      expect(updated.body.name).toBe('After Name');

      const log = await owner.client.get(`${base}/audit-logs?limit=1`).expect(200);
      expect(log.body.data).toEqual([
        expect.objectContaining({
          action: 'tenant.updated',
          before: { name: 'Before Name' },
          after: { name: 'After Name' },
          actorUserId: owner.userId,
        }),
      ]);
      expect(log.body.pageInfo.hasNextPage).toBe(true);

      const next = await owner.client
        .get(`${base}/audit-logs?limit=1&cursor=${log.body.pageInfo.nextCursor}`)
        .expect(200);
      expect(next.body.data[0].action).toBe('tenant.created');
      expect(next.body.pageInfo).toEqual({ hasNextPage: false, nextCursor: null });
    });

    it('rejects a tampered pagination cursor', async () => {
      const owner = await registerOwner(t.app);
      await owner.client.get(`/tenants/${owner.tenantId}/audit-logs?cursor=garbage`).expect(400);
    });
  });
});
