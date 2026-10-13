import type { Customer, Paginated } from '@pointshub/shared';
import { randomUUID } from 'node:crypto';
import { type Owner, registerOwner, uniqueEmail } from './support/api-client';
import { addMember, createCustomer, givePoints } from './support/fixtures';
import { createTestApp, type TestApp } from './support/test-app';

describe('Customers', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  const path = (owner: Owner, suffix = '') => `/tenants/${owner.tenantId}/customers${suffix}`;

  /** Follows nextCursor until the end and returns every customer name in order. */
  async function allPages(owner: Owner, query: string): Promise<string[]> {
    const names: string[] = [];
    let cursor: string | null = null;
    do {
      const qs: string = cursor ? `${query}&cursor=${cursor}` : query;
      const page = (await owner.client.get(path(owner, `?${qs}`)).expect(200))
        .body as Paginated<Customer>;
      names.push(...page.data.map((c) => c.name));
      cursor = page.pageInfo.nextCursor;
    } while (cursor);
    return names;
  }

  describe('enrolment and editing', () => {
    it('enrols a customer in the entry tier', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner, {
        name: 'Grace Hopper',
        email: 'GRACE@Example.test',
        phone: '+44 7700 900123',
        tags: ['VIP', 'vip', 'regular'],
      });
      expect(customer).toMatchObject({
        name: 'Grace Hopper',
        email: 'grace@example.test',
        tags: ['vip', 'regular'],
        tier: { name: 'Bronze' },
        pointsBalance: 0,
      });
    });

    it('rejects a duplicate email within the business only', async () => {
      const a = await registerOwner(t.app);
      const b = await registerOwner(t.app);
      const email = uniqueEmail();
      await createCustomer(a, { email });
      const dup = await a.client.post(path(a), { name: 'Again', email }).expect(409);
      expect(dup.body.type).toBe('/problems/duplicate-customer');
      await createCustomer(b, { email });
    });

    it('updates details and records the change', async () => {
      const owner = await registerOwner(t.app);
      const customer = await createCustomer(owner, { name: 'Old Name' });
      const res = await owner.client
        .patch(path(owner, `/${customer.id}`), { name: 'New Name', phone: null })
        .expect(200);
      expect(res.body).toMatchObject({ name: 'New Name', phone: null });

      const audit = await owner.client.get(`/tenants/${owner.tenantId}/audit-logs?limit=1`);
      expect(audit.body.data[0]).toMatchObject({
        action: 'customer.updated',
        before: { name: 'Old Name', phone: null },
        after: { name: 'New Name', phone: null },
      });
    });

    it('returns 404 for unknown or malformed ids', async () => {
      const owner = await registerOwner(t.app);
      await owner.client.get(path(owner, `/${randomUUID()}`)).expect(404);
      await owner.client.get(path(owner, '/not-a-uuid')).expect(404);
    });
  });

  describe('listing', () => {
    let owner: Owner;

    beforeAll(async () => {
      owner = await registerOwner(t.app);
      const people = [
        { name: 'Charlie', tags: ['vip'], points: 30 },
        { name: 'Alice', tags: [], points: 10 },
        { name: 'Bob', tags: ['vip'], points: 50 },
        { name: 'Dana', tags: [], points: 20 },
        { name: 'Eve', tags: ['staff-friend'], points: 40 },
      ];
      for (const p of people) {
        const c = await createCustomer(owner, { name: p.name, tags: p.tags });
        await givePoints(owner, c.id, p.points);
      }
    });

    it('pages newest first without gaps or repeats', async () => {
      expect(await allPages(owner, 'limit=2')).toEqual(['Eve', 'Dana', 'Bob', 'Alice', 'Charlie']);
    });

    it('sorts by name and by points across pages', async () => {
      expect(await allPages(owner, 'limit=2&sort=name')).toEqual([
        'Alice',
        'Bob',
        'Charlie',
        'Dana',
        'Eve',
      ]);
      expect(await allPages(owner, 'limit=2&sort=points')).toEqual([
        'Bob',
        'Eve',
        'Charlie',
        'Dana',
        'Alice',
      ]);
    });

    it('searches name and email case-insensitively', async () => {
      expect(await allPages(owner, 'q=ALI')).toEqual(['Alice']);
    });

    it('filters by tag and tier', async () => {
      expect(await allPages(owner, 'tag=vip&sort=name')).toEqual(['Bob', 'Charlie']);
      const tiers = await owner.client.get(`/tenants/${owner.tenantId}/tiers`);
      const silver = (tiers.body.data as Array<{ id: string; name: string }>).find(
        (tier) => tier.name === 'Silver',
      )!;
      expect(await allPages(owner, `tierId=${silver.id}`)).toEqual([]);
    });

    it('rejects a cursor from a different sort order', async () => {
      const page = await owner.client.get(path(owner, '?limit=1&sort=name')).expect(200);
      await owner.client
        .get(path(owner, `?limit=1&sort=points&cursor=${page.body.pageInfo.nextCursor}`))
        .expect(400);
    });

    it('caps the page size at 100', async () => {
      await owner.client.get(path(owner, '?limit=101')).expect(400);
    });
  });

  describe('bulk actions', () => {
    it('adjusts points for every selected customer', async () => {
      const owner = await registerOwner(t.app);
      const customers = await Promise.all([1, 2, 3].map(() => createCustomer(owner)));
      const res = await owner.client
        .post(path(owner, '/bulk'), {
          action: 'ADJUST_POINTS',
          customerIds: customers.map((c) => c.id),
          params: { points: 25, reason: 'Welcome bonus' },
        })
        .expect(200);
      expect(res.body).toEqual({ affected: 3 });
      for (const c of customers) {
        const after = await owner.client.get(path(owner, `/${c.id}`));
        expect(after.body.pointsBalance).toBe(25);
      }
    });

    it('changes nothing if any adjustment would go negative', async () => {
      const owner = await registerOwner(t.app);
      const rich = await createCustomer(owner);
      const poor = await createCustomer(owner);
      await givePoints(owner, rich.id, 100);
      await givePoints(owner, poor.id, 5);

      await owner.client
        .post(path(owner, '/bulk'), {
          action: 'ADJUST_POINTS',
          customerIds: [rich.id, poor.id],
          params: { points: -10, reason: 'Clawback' },
        })
        .expect(409);
      expect((await owner.client.get(path(owner, `/${rich.id}`))).body.pointsBalance).toBe(100);
      expect((await owner.client.get(path(owner, `/${poor.id}`))).body.pointsBalance).toBe(5);
    });

    it("changes nothing if any id is not one of this business's customers", async () => {
      const owner = await registerOwner(t.app);
      const other = await registerOwner(t.app);
      const mine = await createCustomer(owner);
      const theirs = await createCustomer(other);

      await owner.client
        .post(path(owner, '/bulk'), {
          action: 'ADD_TAG',
          customerIds: [mine.id, theirs.id],
          params: { tag: 'promo' },
        })
        .expect(404);
      expect((await owner.client.get(path(owner, `/${mine.id}`))).body.tags).toEqual([]);
      expect((await other.client.get(path(other, `/${theirs.id}`))).body.tags).toEqual([]);
    });

    it('adds and removes tags without duplicates', async () => {
      const owner = await registerOwner(t.app);
      const tagged = await createCustomer(owner, { tags: ['promo'] });
      const plain = await createCustomer(owner);
      const ids = [tagged.id, plain.id];

      const added = await owner.client
        .post(path(owner, '/bulk'), {
          action: 'ADD_TAG',
          customerIds: ids,
          params: { tag: 'Promo' },
        })
        .expect(200);
      expect(added.body).toEqual({ affected: 1 });
      expect((await owner.client.get(path(owner, `/${tagged.id}`))).body.tags).toEqual(['promo']);

      const removed = await owner.client
        .post(path(owner, '/bulk'), {
          action: 'REMOVE_TAG',
          customerIds: ids,
          params: { tag: 'promo' },
        })
        .expect(200);
      expect(removed.body).toEqual({ affected: 2 });
      expect((await owner.client.get(path(owner, `/${plain.id}`))).body.tags).toEqual([]);
    });

    it('accepts at most 500 customers per request', async () => {
      const owner = await registerOwner(t.app);
      await owner.client
        .post(path(owner, '/bulk'), {
          action: 'ADD_TAG',
          customerIds: Array.from({ length: 501 }, () => randomUUID()),
          params: { tag: 'x' },
        })
        .expect(400);
    });

    it('is not available to staff', async () => {
      const owner = await registerOwner(t.app);
      const staff = await addMember(t, owner, 'STAFF');
      const c = await createCustomer(owner);
      await staff.client
        .post(path(owner, '/bulk'), {
          action: 'ADD_TAG',
          customerIds: [c.id],
          params: { tag: 'x' },
        })
        .expect(403);
    });
  });

  describe('CSV export', () => {
    it('streams matching customers with spreadsheet-safe cells', async () => {
      const owner = await registerOwner(t.app);
      await createCustomer(owner, { name: '=HYPERLINK("http://evil")', tags: ['vip'] });
      await createCustomer(owner, { name: 'Plain, Person' });

      const res = await owner.client.get(path(owner, '/export?tag=vip')).expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="customers-/);

      const lines = res.text.trim().split('\r\n');
      expect(lines[0]).toBe(
        'id,name,email,phone,tier,points_balance,lifetime_points,tags,joined_at',
      );
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain(`"'=HYPERLINK(""http://evil"")"`);
    });

    it('is not available to staff', async () => {
      const owner = await registerOwner(t.app);
      const staff = await addMember(t, owner, 'STAFF');
      await staff.client.get(path(owner, '/export')).expect(403);
    });
  });
});
