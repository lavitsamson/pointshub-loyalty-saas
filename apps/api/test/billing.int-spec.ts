import type { AuditLogEntry, BillingOverview } from '@pointshub/shared';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import request from 'supertest';
import {
  ApiClient,
  type Owner,
  registerOwner,
  TEST_PASSWORD,
  uniqueEmail,
} from './support/api-client';
import {
  billingEnv,
  deliver,
  FakeBillingGateway,
  stripeEvent,
  WEBHOOK_SECRET,
} from './support/billing';
import { addMember, businessSlug, PORTAL_PASSWORD_LINK } from './support/fixtures';
import { createTestApp, type TestApp } from './support/test-app';

describe('Billing', () => {
  let t: TestApp;
  let stripe: FakeBillingGateway;

  beforeAll(async () => {
    stripe = new FakeBillingGateway();
    t = await createTestApp({ env: billingEnv(), billingGateway: stripe });
  });

  afterAll(async () => {
    await t.close();
  });

  const overview = async (owner: Owner) =>
    (await owner.client.get(`/tenants/${owner.tenantId}/billing`).expect(200))
      .body as BillingOverview;

  const auditActions = async (owner: Owner) => {
    const res = await owner.client.get(`/tenants/${owner.tenantId}/audit-logs`).expect(200);
    return (res.body.data as AuditLogEntry[]).filter((e) => e.action.startsWith('billing.'));
  };

  /** Checkout as the owner, then complete it on "Stripe" and deliver the webhook. */
  async function upgrade(owner: Owner) {
    await owner.client.post(`/tenants/${owner.tenantId}/billing/checkout`).expect(201);
    const customerId = stripe.customerOf(owner.tenantId)!;
    const subscription = stripe.subscribe(customerId);
    const event = stripeEvent('checkout.session.completed', {
      object: 'checkout.session',
      mode: 'subscription',
      client_reference_id: owner.tenantId,
      customer: customerId,
      subscription: subscription.id,
    });
    const res = await deliver(t.app, event).expect(200);
    expect(res.body).toEqual({ duplicate: false });
    return { customerId, subscription, event };
  }

  describe('overview', () => {
    it('shows a new business on Free with its usage', async () => {
      const owner = await registerOwner(t.app);
      expect(await overview(owner)).toEqual({
        plan: 'FREE',
        subscriptionStatus: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        hasBillingAccount: false,
        billingAvailable: true,
        usage: { customers: 0, customerLimit: 100 },
      });
    });

    it('is visible to every member, but only the owner can change the plan', async () => {
      const owner = await registerOwner(t.app);
      for (const role of ['ADMIN', 'STAFF'] as const) {
        const member = await addMember(t, owner, role);
        await member.client.get(`/tenants/${owner.tenantId}/billing`).expect(200);
        await member.client.post(`/tenants/${owner.tenantId}/billing/checkout`).expect(403);
        await member.client.post(`/tenants/${owner.tenantId}/billing/portal`).expect(403);
      }
    });
  });

  describe('checkout and portal', () => {
    it('creates one Stripe customer for the business and returns a Checkout URL', async () => {
      const owner = await registerOwner(t.app, 'Checkout Café');
      const first = await owner.client.post(`/tenants/${owner.tenantId}/billing/checkout`);
      expect(first.status).toBe(201);
      expect(first.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
      await owner.client.post(`/tenants/${owner.tenantId}/billing/checkout`).expect(201);

      const customerId = stripe.customerOf(owner.tenantId)!;
      expect(stripe.customers.get(customerId)).toEqual({
        tenantId: owner.tenantId,
        name: 'Checkout Café',
        email: owner.email,
      });
      expect(stripe.checkouts.at(-1)).toEqual({
        tenantId: owner.tenantId,
        customerId,
        successUrl: `http://localhost:3000/app/${owner.tenantId}/billing?checkout=success`,
        cancelUrl: `http://localhost:3000/app/${owner.tenantId}/billing?checkout=cancelled`,
      });
      // Checkout alone changes nothing: only Stripe's confirmation does.
      expect(await overview(owner)).toMatchObject({ plan: 'FREE', hasBillingAccount: true });
    });

    it('has no portal before the business has a billing account', async () => {
      const owner = await registerOwner(t.app);
      const res = await owner.client.post(`/tenants/${owner.tenantId}/billing/portal`).expect(409);
      expect(res.body.type).toBe('/problems/no-billing-account');
    });

    it('opens the portal for a subscribed business, and refuses a second checkout', async () => {
      const owner = await registerOwner(t.app);
      const { customerId } = await upgrade(owner);
      const portal = await owner.client.post(`/tenants/${owner.tenantId}/billing/portal`);
      expect(portal.status).toBe(201);
      expect(portal.body.url).toBe(`https://billing.stripe.test/p/${customerId}`);

      const again = await owner.client.post(`/tenants/${owner.tenantId}/billing/checkout`);
      expect(again.status).toBe(409);
      expect(again.body.type).toBe('/problems/already-subscribed');
    });
  });

  describe('webhooks', () => {
    it('moves the business to Pro when Checkout completes, and audits it', async () => {
      const owner = await registerOwner(t.app);
      const { subscription } = await upgrade(owner);

      expect(await overview(owner)).toMatchObject({
        plan: 'PRO',
        subscriptionStatus: 'active',
        currentPeriodEnd: subscription.currentPeriodEnd!.toISOString(),
        cancelAtPeriodEnd: false,
        usage: { customerLimit: null },
      });
      expect(await auditActions(owner)).toEqual([
        expect.objectContaining({
          action: 'billing.subscription_changed',
          actorUserId: null,
          before: { plan: 'FREE', subscriptionStatus: null },
          after: { plan: 'PRO', subscriptionStatus: 'active' },
        }),
      ]);
    });

    it('applies a redelivered event once', async () => {
      const owner = await registerOwner(t.app);
      const { event } = await upgrade(owner);

      const again = await deliver(t.app, event).expect(200);
      expect(again.body).toEqual({ duplicate: true });
      expect(
        await t.prisma.unscoped.stripeWebhookEvent.count({ where: { stripeEventId: event.id } }),
      ).toBe(1);
      expect(await auditActions(owner)).toHaveLength(1);
    });

    it('applies concurrent deliveries of one event once', async () => {
      const owner = await registerOwner(t.app);
      const { customerId, subscription } = await upgrade(owner);
      stripe.update(subscription.id, { status: 'past_due' });
      const event = stripeEvent('invoice.payment_failed', {
        object: 'invoice',
        customer: customerId,
      });

      const results = await Promise.all(Array.from({ length: 5 }, () => deliver(t.app, event)));
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect(results.filter((r) => r.body.duplicate === false)).toHaveLength(1);
      const paymentEmails = t.mailbox.messages.filter(
        (m) => m.to === owner.email && m.subject.startsWith('Payment failed'),
      );
      expect(paymentEmails).toHaveLength(1);
    });

    it('keeps Pro while a failed payment is retried, and emails the owner', async () => {
      const owner = await registerOwner(t.app, 'Late Payer');
      const { customerId, subscription } = await upgrade(owner);
      stripe.update(subscription.id, { status: 'past_due' });

      await deliver(
        t.app,
        stripeEvent('invoice.payment_failed', { object: 'invoice', customer: customerId }),
      ).expect(200);

      expect(await overview(owner)).toMatchObject({ plan: 'PRO', subscriptionStatus: 'past_due' });
      const email = t.mailbox.lastTo(owner.email);
      expect(email.subject).toBe('Payment failed for Late Payer on PointsHub');
      expect(email.text).toContain(`http://localhost:3000/app/${owner.tenantId}/billing`);
    });

    it('records a cancellation scheduled for the end of the period', async () => {
      const owner = await registerOwner(t.app);
      const { customerId, subscription } = await upgrade(owner);
      stripe.update(subscription.id, { cancelAtPeriodEnd: true });

      await deliver(
        t.app,
        stripeEvent('customer.subscription.updated', {
          object: 'subscription',
          id: subscription.id,
          customer: customerId,
        }),
      ).expect(200);
      expect(await overview(owner)).toMatchObject({ plan: 'PRO', cancelAtPeriodEnd: true });
    });

    it('moves the business back to Free when the subscription ends', async () => {
      const owner = await registerOwner(t.app);
      const { customerId, subscription } = await upgrade(owner);
      stripe.update(subscription.id, { status: 'canceled' });

      await deliver(
        t.app,
        stripeEvent('customer.subscription.deleted', {
          object: 'subscription',
          id: subscription.id,
          customer: customerId,
          status: 'canceled',
        }),
      ).expect(200);
      expect(await overview(owner)).toMatchObject({
        plan: 'FREE',
        subscriptionStatus: 'canceled',
        usage: { customerLimit: 100 },
      });
    });

    it('uses the current subscription state, not a stale event payload', async () => {
      const owner = await registerOwner(t.app);
      const { customerId, subscription } = await upgrade(owner);
      // Cancelled on Stripe; the earlier "updated" event (still saying active) arrives last.
      stripe.update(subscription.id, { status: 'canceled' });

      await deliver(
        t.app,
        stripeEvent('customer.subscription.updated', {
          object: 'subscription',
          id: subscription.id,
          customer: customerId,
          status: 'active',
        }),
      ).expect(200);
      expect(await overview(owner)).toMatchObject({ plan: 'FREE', subscriptionStatus: 'canceled' });
    });

    it("ignores a Checkout session that names another business's id", async () => {
      const attacker = await registerOwner(t.app);
      const victim = await registerOwner(t.app);
      await attacker.client.post(`/tenants/${attacker.tenantId}/billing/checkout`).expect(201);
      const customerId = stripe.customerOf(attacker.tenantId)!;
      const subscription = stripe.subscribe(customerId);

      await deliver(
        t.app,
        stripeEvent('checkout.session.completed', {
          object: 'checkout.session',
          mode: 'subscription',
          client_reference_id: victim.tenantId,
          customer: customerId,
          subscription: subscription.id,
        }),
      ).expect(200);
      expect(await overview(victim)).toMatchObject({ plan: 'FREE', hasBillingAccount: false });
    });

    it('acknowledges events it does not handle, or for unknown customers', async () => {
      const ignored = [
        stripeEvent('customer.created', { object: 'customer', id: 'cus_other' }),
        stripeEvent('customer.subscription.updated', {
          object: 'subscription',
          id: 'sub_unknown',
          customer: 'cus_unknown',
        }),
        stripeEvent('checkout.session.completed', {
          object: 'checkout.session',
          mode: 'subscription',
          client_reference_id: 'not-a-tenant-id',
          customer: 'cus_unknown',
          subscription: 'sub_unknown',
        }),
      ];
      for (const event of ignored) {
        const res = await deliver(t.app, event).expect(200);
        expect(res.body).toEqual({ duplicate: false });
      }
    });

    describe('signature', () => {
      const event = () => stripeEvent('customer.created', { object: 'customer', id: 'cus_x' });

      it('rejects a missing signature', async () => {
        const res = await request(t.app.getHttpServer())
          .post('/api/v1/webhooks/stripe')
          .set('Content-Type', 'application/json')
          .send(JSON.stringify(event()))
          .expect(400);
        expect(res.body.type).toBe('/problems/invalid-signature');
      });

      it('rejects a signature made with another secret', async () => {
        const forged = event();
        await deliver(t.app, forged, 'whsec_attacker').expect(400);
        expect(
          await t.prisma.unscoped.stripeWebhookEvent.count({ where: { stripeEventId: forged.id } }),
        ).toBe(0);
      });

      it('rejects a body changed after signing', async () => {
        const signed = event();
        const payload = JSON.stringify(signed);
        const signature = Stripe.webhooks.generateTestHeaderString({
          payload,
          secret: WEBHOOK_SECRET,
        });
        await request(t.app.getHttpServer())
          .post('/api/v1/webhooks/stripe')
          .set('Content-Type', 'application/json')
          .set('Stripe-Signature', signature)
          .send(payload.replace('cus_x', 'cus_y'))
          .expect(400);
      });
    });
  });

  describe('plan limits', () => {
    /** Adds customers straight to the database: the API is not what is under test here. */
    async function fill(tenantId: string, count: number) {
      await t.prisma.unscoped.customer.createMany({
        data: Array.from({ length: count }, () => ({
          tenantId,
          name: 'Filler',
          email: uniqueEmail('filler'),
        })),
      });
    }

    const enrol = (owner: Owner) =>
      owner.client.post(`/tenants/${owner.tenantId}/customers`, {
        name: 'One Too Many',
        email: uniqueEmail('customer'),
      });

    it('refuses the 101st customer on Free with a 402 problem', async () => {
      const owner = await registerOwner(t.app);
      await fill(owner.tenantId, 100);

      const res = await enrol(owner).expect(402);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body).toMatchObject({
        type: '/problems/plan-limit',
        title: 'Plan limit reached',
        detail: 'The Free plan includes up to 100 customers. Upgrade to Pro to add more.',
      });
      expect(await overview(owner)).toMatchObject({ usage: { customers: 100 } });
    });

    it('cannot be overshot by concurrent enrolments', async () => {
      const owner = await registerOwner(t.app);
      await fill(owner.tenantId, 98);

      const results = await Promise.all(Array.from({ length: 6 }, () => enrol(owner)));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 201, 402, 402, 402, 402]);
      expect(await t.prisma.unscoped.customer.count({ where: { tenantId: owner.tenantId } })).toBe(
        100,
      );
    });

    it('lifts the limit on Pro', async () => {
      const owner = await registerOwner(t.app);
      await fill(owner.tenantId, 100);
      await upgrade(owner);
      await enrol(owner).expect(201);
    });

    it('applies to customers joining through the portal, without upselling them', async () => {
      const owner = await registerOwner(t.app);
      await fill(owner.tenantId, 100);
      const slug = await businessSlug(owner);
      const email = uniqueEmail('member');
      const client = new ApiClient(t.app);
      await client
        .post(`/portal/${slug}/auth/register`, { name: 'Late Joiner', email })
        .expect(202);
      const token = t.mailbox.tokenFor(email, PORTAL_PASSWORD_LINK);

      const refused = await client
        .post(`/portal/${slug}/auth/set-password`, { token, password: TEST_PASSWORD })
        .expect(402);
      expect(refused.body.detail).toBe(
        'This rewards programme is not taking new members online right now. Please ask in store.',
      );

      // The link was not used up: it works once the business has room.
      await upgrade(owner);
      await client
        .post(`/portal/${slug}/auth/set-password`, { token, password: TEST_PASSWORD })
        .expect(200);
    });
  });
});

describe('Billing without Stripe configured', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('reports billing as unavailable and answers 503', async () => {
    const owner = await registerOwner(t.app);
    const res = await owner.client.get(`/tenants/${owner.tenantId}/billing`).expect(200);
    expect(res.body).toMatchObject({ plan: 'FREE', billingAvailable: false });

    const checkout = await owner.client
      .post(`/tenants/${owner.tenantId}/billing/checkout`)
      .expect(503);
    expect(checkout.body.type).toBe('/problems/billing-unavailable');
    await owner.client.post(`/tenants/${owner.tenantId}/billing/portal`).expect(503);
  });

  it('refuses webhooks', async () => {
    await deliver(t.app, stripeEvent('customer.created', { id: randomUUID() })).expect(503);
  });
});
