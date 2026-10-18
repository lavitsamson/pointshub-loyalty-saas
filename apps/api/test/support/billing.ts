import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import request from 'supertest';
import type {
  BillingGateway,
  CheckoutRequest,
  SubscriptionSnapshot,
} from '../../src/billing/billing-gateway';
import type { Env } from '../../src/config/env';
import { testEnv } from './infra';

export const WEBHOOK_SECRET = 'whsec_integration_test';

/** The test environment with Stripe "configured"; calls go to a FakeBillingGateway. */
export function billingEnv(): Env {
  return {
    ...testEnv(),
    STRIPE_SECRET_KEY: 'sk_test_fake',
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_PRO_PRICE_ID: 'price_pro',
  };
}

const DAY = 24 * 60 * 60 * 1000;

/** An in-memory Stripe account: just enough state to answer what the API asks of it. */
export class FakeBillingGateway implements BillingGateway {
  readonly customers = new Map<string, { tenantId: string; name: string; email: string }>();
  readonly subscriptions = new Map<string, SubscriptionSnapshot>();
  readonly checkouts: CheckoutRequest[] = [];

  createCustomer(input: { tenantId: string; name: string; email: string }): Promise<string> {
    // Like the idempotency key the real gateway sends: one customer per tenant.
    const existing = [...this.customers].find(([, c]) => c.tenantId === input.tenantId);
    if (existing) return Promise.resolve(existing[0]);
    const id = `cus_${randomUUID().slice(0, 12)}`;
    this.customers.set(id, input);
    return Promise.resolve(id);
  }

  createCheckoutSession(input: CheckoutRequest): Promise<string> {
    this.checkouts.push(input);
    return Promise.resolve(`https://checkout.stripe.test/c/${this.checkouts.length}`);
  }

  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string> {
    return Promise.resolve(`https://billing.stripe.test/p/${input.customerId}`);
  }

  getSubscription(subscriptionId: string): Promise<SubscriptionSnapshot> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return Promise.reject(new Error(`No such subscription: ${subscriptionId}`));
    return Promise.resolve({ ...subscription });
  }

  /** What completing Checkout does on Stripe's side: an active monthly subscription. */
  subscribe(customerId: string): SubscriptionSnapshot {
    const subscription: SubscriptionSnapshot = {
      id: `sub_${randomUUID().slice(0, 12)}`,
      customerId,
      status: 'active',
      currentPeriodEnd: new Date(Math.floor((Date.now() + 30 * DAY) / 1000) * 1000),
      cancelAtPeriodEnd: false,
    };
    this.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  update(subscriptionId: string, changes: Partial<SubscriptionSnapshot>): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) throw new Error(`No such subscription: ${subscriptionId}`);
    this.subscriptions.set(subscriptionId, { ...subscription, ...changes });
  }

  customerOf(tenantId: string): string | undefined {
    return [...this.customers].find(([, c]) => c.tenantId === tenantId)?.[0];
  }
}

/** A Stripe event envelope around `object`, shaped like a real delivery. */
export function stripeEvent(type: string, object: object) {
  return {
    id: `evt_${randomUUID().replaceAll('-', '').slice(0, 24)}`,
    object: 'event',
    type,
    api_version: Stripe.API_VERSION,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  };
}

/** Delivers an event as Stripe does: JSON body signed with the endpoint's secret. */
export function deliver(
  app: NestExpressApplication,
  event: object,
  secret: string = WEBHOOK_SECRET,
) {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return request(app.getHttpServer())
    .post('/api/v1/webhooks/stripe')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', signature)
    .send(payload);
}
