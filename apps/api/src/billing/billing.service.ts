import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type BillingOverview, type BillingRedirect, PLAN_LIMITS } from '@pointshub/shared';
import { ProblemException } from '../common/http/problem.exception';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../infra/prisma.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { BILLING_GATEWAY, type BillingGateway } from './billing-gateway';

const billingUnavailable = () =>
  new ProblemException({
    type: '/problems/billing-unavailable',
    title: 'Billing is not available',
    status: 503,
    detail: 'Online billing is not set up on this installation.',
  });

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BILLING_GATEWAY) private readonly gateway: BillingGateway | null,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async overview(tenantId: string): Promise<BillingOverview> {
    const [tenant, customers] = await Promise.all([
      this.findTenant(tenantId),
      this.prisma.scoped.customer.count(),
    ]);
    return {
      plan: tenant.plan,
      subscriptionStatus: tenant.subscriptionStatus,
      currentPeriodEnd: tenant.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: tenant.cancelAtPeriodEnd,
      hasBillingAccount: tenant.stripeCustomerId !== null,
      billingAvailable: this.gateway !== null,
      usage: { customers, customerLimit: PLAN_LIMITS[tenant.plan].maxCustomers },
    };
  }

  /**
   * Starts a Pro subscription on Stripe Checkout. Nothing changes here until Stripe confirms
   * the payment with a webhook; the success page only says that confirmation is on its way.
   */
  async checkout(ctx: TenantContext): Promise<BillingRedirect> {
    const gateway = this.requireGateway();
    const tenant = await this.findTenant(ctx.tenantId);
    if (tenant.plan === 'PRO') {
      throw new ProblemException({
        type: '/problems/already-subscribed',
        title: 'Already on Pro',
        status: 409,
        detail: 'This business is already on the Pro plan.',
      });
    }

    const customerId = tenant.stripeCustomerId ?? (await this.createCustomer(gateway, ctx, tenant));
    const billingPage = this.billingPage(ctx.tenantId);
    const url = await gateway.createCheckoutSession({
      tenantId: ctx.tenantId,
      customerId,
      successUrl: `${billingPage}?checkout=success`,
      cancelUrl: `${billingPage}?checkout=cancelled`,
    });
    return { url };
  }

  /** Opens Stripe's Billing Portal: payment details, invoices, cancellation. */
  async portal(ctx: TenantContext): Promise<BillingRedirect> {
    const gateway = this.requireGateway();
    const tenant = await this.findTenant(ctx.tenantId);
    if (!tenant.stripeCustomerId) {
      throw new ProblemException({
        type: '/problems/no-billing-account',
        title: 'No billing account',
        status: 409,
        detail: 'This business has not subscribed yet, so there is nothing to manage.',
      });
    }
    const url = await gateway.createPortalSession({
      customerId: tenant.stripeCustomerId,
      returnUrl: this.billingPage(ctx.tenantId),
    });
    return { url };
  }

  private async createCustomer(
    gateway: BillingGateway,
    ctx: TenantContext,
    tenant: { name: string },
  ): Promise<string> {
    const owner = await this.prisma.unscoped.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { email: true },
    });
    const created = await gateway.createCustomer({
      tenantId: ctx.tenantId,
      name: tenant.name,
      email: owner.email,
    });
    // Only the first concurrent checkout links its customer; the Stripe idempotency key
    // means a racing request received the same customer anyway.
    await this.prisma.unscoped.tenant.updateMany({
      where: { id: ctx.tenantId, stripeCustomerId: null },
      data: { stripeCustomerId: created },
    });
    const linked = await this.findTenant(ctx.tenantId);
    return linked.stripeCustomerId ?? created;
  }

  private requireGateway(): BillingGateway {
    if (!this.gateway) throw billingUnavailable();
    return this.gateway;
  }

  private billingPage(tenantId: string): string {
    return `${this.env.WEB_ORIGIN}/app/${tenantId}/billing`;
  }

  private async findTenant(tenantId: string) {
    const tenant = await this.prisma.unscoped.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }
}
