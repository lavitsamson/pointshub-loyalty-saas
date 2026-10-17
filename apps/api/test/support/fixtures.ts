import type { Customer, MeResponse, PortalMe, Reward } from '@pointshub/shared';
import { randomUUID } from 'node:crypto';
import { ApiClient, type Owner, TEST_PASSWORD, uniqueEmail } from './api-client';
import type { TestApp } from './test-app';

const INVITE_LINK = /\/invite\/([^\s]+)/;

export interface Member {
  client: ApiClient;
  email: string;
  userId: string;
  /** The invitation token that was accepted. */
  token: string;
}

/** Invites a brand-new person into the owner's business with `role` and signs them in. */
export async function addMember(
  t: TestApp,
  owner: Owner,
  role: 'ADMIN' | 'STAFF',
): Promise<Member> {
  const email = uniqueEmail(role.toLowerCase());
  await owner.client.post(`/tenants/${owner.tenantId}/invitations`, { email, role }).expect(201);
  const token = t.mailbox.tokenFor(email, INVITE_LINK);
  const client = new ApiClient(t.app);
  const res = await client
    .post(`/invitations/${token}/accept`, { name: `New ${role}`, password: TEST_PASSWORD })
    .expect(200);
  return { client, email, userId: (res.body as MeResponse).user.id, token };
}

export const PORTAL_PASSWORD_LINK = /\/set-password\?token=([^\s]+)/;

/** The owner's business slug: the address of its customer portal. */
export async function businessSlug(owner: Owner): Promise<string> {
  const res = await owner.client.get(`/tenants/${owner.tenantId}`).expect(200);
  return (res.body as { slug: string }).slug;
}

export interface PortalCustomer {
  client: ApiClient;
  /** `/portal/<slug>`, to prefix portal paths with. */
  base: string;
  customerId: string;
  email: string;
}

/**
 * A customer who joined the business's programme through its portal: asked to join, followed
 * the emailed link and chose a password. Returns them signed in.
 */
export async function joinPortal(
  t: TestApp,
  slug: string,
  email: string = uniqueEmail('member'),
): Promise<PortalCustomer> {
  const client = new ApiClient(t.app);
  const base = `/portal/${slug}`;
  await client.post(`${base}/auth/register`, { name: 'Portal Member', email }).expect(202);
  const token = t.mailbox.tokenFor(email, PORTAL_PASSWORD_LINK);
  const res = await client
    .post(`${base}/auth/set-password`, { token, password: TEST_PASSWORD })
    .expect(200);
  return { client, base, customerId: (res.body as PortalMe).customer.id, email };
}

export async function createCustomer(
  owner: Owner,
  overrides: Partial<{ name: string; email: string; phone: string; tags: string[] }> = {},
): Promise<Customer> {
  const res = await owner.client
    .post(`/tenants/${owner.tenantId}/customers`, {
      name: 'Test Customer',
      email: uniqueEmail('customer'),
      ...overrides,
    })
    .expect(201);
  return res.body as Customer;
}

export function recordPurchase(
  client: ApiClient,
  tenantId: string,
  customerId: string,
  amount: string | number,
  idempotencyKey: string = randomUUID(),
) {
  return client
    .post(`/tenants/${tenantId}/purchases`, { customerId, amount })
    .set('Idempotency-Key', idempotencyKey);
}

/** Credits points directly through an adjustment (owner only). */
export async function givePoints(owner: Owner, customerId: string, points: number) {
  await owner.client
    .post(`/tenants/${owner.tenantId}/customers/${customerId}/adjustments`, {
      points,
      reason: 'Test setup',
    })
    .expect(201);
}

export async function createReward(
  owner: Owner,
  overrides: Partial<{
    name: string;
    pointsCost: number;
    stock: number | null;
    active: boolean;
  }> = {},
): Promise<Reward> {
  const res = await owner.client
    .post(`/tenants/${owner.tenantId}/rewards`, {
      name: 'Free coffee',
      pointsCost: 100,
      ...overrides,
    })
    .expect(201);
  return res.body as Reward;
}
