import type Stripe from 'stripe';

/** The parts of a Stripe subscription PointsHub mirrors onto the tenant. */
export interface SubscriptionSnapshot {
  id: string;
  customerId: string;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface CheckoutRequest {
  tenantId: string;
  customerId: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Everything the API asks of the payment provider. Tests substitute an in-memory fake, so
 * no test calls Stripe; webhook signatures are still checked with the real SDK.
 */
export interface BillingGateway {
  createCustomer(input: { tenantId: string; name: string; email: string }): Promise<string>;
  /** Returns the URL of a hosted Checkout page for the Pro subscription. */
  createCheckoutSession(input: CheckoutRequest): Promise<string>;
  /** Returns the URL of the hosted Billing Portal for the customer. */
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string>;
  getSubscription(subscriptionId: string): Promise<SubscriptionSnapshot>;
}

/** Resolves to null when Stripe is not configured. */
export const BILLING_GATEWAY = Symbol('BILLING_GATEWAY');

export class StripeBillingGateway implements BillingGateway {
  constructor(
    private readonly stripe: Stripe,
    private readonly proPriceId: string,
  ) {}

  async createCustomer(input: { tenantId: string; name: string; email: string }) {
    const customer = await this.stripe.customers.create(
      { name: input.name, email: input.email, metadata: { tenantId: input.tenantId } },
      // A double-click on "Upgrade" must not leave two Stripe customers for one business.
      { idempotencyKey: `tenant-customer-${input.tenantId}` },
    );
    return customer.id;
  }

  async createCheckoutSession(input: CheckoutRequest) {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: input.customerId,
      client_reference_id: input.tenantId,
      line_items: [{ price: this.proPriceId, quantity: 1 }],
      subscription_data: { metadata: { tenantId: input.tenantId } },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    if (!session.url) throw new Error('Stripe returned a Checkout session without a URL');
    return session.url;
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }) {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return session.url;
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionSnapshot> {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    // The billing period lives on the subscription item since API version 2025-03-31. A
    // cancellation scheduled from the Billing Portal may set cancel_at instead of the flag.
    const periodEnd = sub.cancel_at ?? sub.items.data[0]?.current_period_end;
    return {
      id: sub.id,
      customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      status: sub.status,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at !== null,
    };
  }
}
