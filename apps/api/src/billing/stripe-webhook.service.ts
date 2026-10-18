import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, Tenant } from '@pointshub/db';
import { planForSubscription } from '@pointshub/shared';
import Stripe from 'stripe';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import type { RequestMeta } from '../auth/decorators';
import { ProblemException } from '../common/http/problem.exception';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../infra/prisma.service';
import { MailService } from '../mail/mail.service';
import { BILLING_GATEWAY, type BillingGateway } from './billing-gateway';

/** Generous for one Stripe API call made while the tenant row is locked. */
const TRANSACTION_TIMEOUT_MS = 15_000;

const UuidSchema = z.uuid();

const invalidSignature = () =>
  new ProblemException({
    type: '/problems/invalid-signature',
    title: 'Invalid webhook signature',
    status: 400,
  });

export interface WebhookOutcome {
  duplicate: boolean;
}

/** What happened inside the transaction that needs doing once it has committed. */
interface Applied {
  paymentFailedTenant?: Tenant;
}

type Tx = Prisma.TransactionClient;

/**
 * Applies Stripe webhook events to tenants.
 *
 * - The signature is verified against the raw request body before anything else.
 * - Each event id is recorded in StripeWebhookEvent in the same transaction as its effects,
 *   so a redelivered event (Stripe retries, or two deliveries at once) is applied once.
 * - Event payloads are treated as a hint only: the subscription is re-read from Stripe while
 *   the tenant row is locked. Stripe does not guarantee delivery order, and this way a late
 *   "updated" event can never overwrite the state written by a newer "deleted" one.
 */
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BILLING_GATEWAY) private readonly gateway: BillingGateway | null,
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  verify(rawBody: Buffer | undefined, signature: string | undefined): Stripe.Event {
    const secret = this.env.STRIPE_WEBHOOK_SECRET;
    if (!this.gateway || !secret) {
      throw new ProblemException({
        type: '/problems/billing-unavailable',
        title: 'Billing is not available',
        status: 503,
      });
    }
    if (!rawBody || !signature) throw invalidSignature();
    try {
      return Stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw invalidSignature();
    }
  }

  async handle(event: Stripe.Event, meta: RequestMeta): Promise<WebhookOutcome> {
    const seen = await this.prisma.unscoped.stripeWebhookEvent.findUnique({
      where: { stripeEventId: event.id },
    });
    if (seen) return { duplicate: true };

    const applied = await this.prisma.unscoped.$transaction(
      async (tx) => {
        // ON CONFLICT DO NOTHING: a concurrent delivery of the same event waits here for the
        // first to commit, then inserts nothing and stops.
        const { count } = await tx.stripeWebhookEvent.createMany({
          data: [{ stripeEventId: event.id, type: event.type }],
          skipDuplicates: true,
        });
        if (count === 0) return null;
        return this.apply(tx, event, meta);
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
    if (!applied) return { duplicate: true };

    if (applied.paymentFailedTenant) await this.notifyPaymentFailed(applied.paymentFailedTenant);
    return { duplicate: false };
  }

  private async apply(tx: Tx, event: Stripe.Event, meta: RequestMeta): Promise<Applied> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const subscriptionId = idOf(session.subscription);
        const tenantId = session.client_reference_id;
        if (session.mode !== 'subscription' || !subscriptionId || !tenantId) return {};
        if (!UuidSchema.safeParse(tenantId).success) return this.ignore(event, 'unknown tenant');

        const tenant = await this.lockTenant(tx, { id: tenantId });
        if (!tenant || tenant.stripeCustomerId !== idOf(session.customer)) {
          return this.ignore(event, 'session does not belong to the tenant');
        }
        await this.sync(tx, tenant, subscriptionId, meta);
        return {};
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const tenant = await this.lockTenant(tx, { customerId: idOf(subscription.customer) });
        if (!tenant) return this.ignore(event, 'unknown customer');
        await this.sync(tx, tenant, subscription.id, meta);
        return {};
      }

      case 'invoice.payment_failed': {
        const tenant = await this.lockTenant(tx, { customerId: idOf(event.data.object.customer) });
        if (!tenant) return this.ignore(event, 'unknown customer');
        if (tenant.stripeSubscriptionId) {
          await this.sync(tx, tenant, tenant.stripeSubscriptionId, meta);
        }
        return { paymentFailedTenant: tenant };
      }

      default:
        // Recorded as processed so a retry is not attempted; nothing else to do.
        return {};
    }
  }

  /** Mirrors the subscription's current state, as Stripe reports it now, onto the tenant. */
  private async sync(
    tx: Tx,
    tenant: Tenant,
    subscriptionId: string,
    meta: RequestMeta,
  ): Promise<void> {
    if (!this.gateway) throw new Error('Stripe events are only accepted when billing is set up');
    const subscription = await this.gateway.getSubscription(subscriptionId);
    if (subscription.customerId !== tenant.stripeCustomerId) {
      this.logger.warn({ subscriptionId, tenantId: tenant.id }, 'Subscription customer mismatch');
      return;
    }
    const plan = planForSubscription(subscription.status);
    // An older subscription that has since ended must not replace the current one.
    const replacing =
      tenant.stripeSubscriptionId && tenant.stripeSubscriptionId !== subscription.id;
    if (replacing && plan === 'FREE') return;

    await tx.tenant.update({
      where: { id: tenant.id },
      data: {
        plan,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
    });

    if (tenant.plan !== plan || tenant.subscriptionStatus !== subscription.status) {
      await this.audit.record(tx, {
        tenantId: tenant.id,
        actorUserId: null,
        action: 'billing.subscription_changed',
        entityType: 'Tenant',
        entityId: tenant.id,
        before: { plan: tenant.plan, subscriptionStatus: tenant.subscriptionStatus },
        after: { plan, subscriptionStatus: subscription.status },
        meta,
      });
    }
  }

  /** Locks the tenant row for the rest of the transaction, so events for it apply in turn. */
  private async lockTenant(
    tx: Tx,
    by: { id: string } | { customerId: string | null },
  ): Promise<Tenant | null> {
    const rows =
      'id' in by
        ? await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "Tenant" WHERE id = ${by.id}::uuid FOR UPDATE`
        : by.customerId
          ? await tx.$queryRaw<Array<{ id: string }>>`
              SELECT id FROM "Tenant" WHERE "stripeCustomerId" = ${by.customerId} FOR UPDATE`
          : [];
    const id = rows[0]?.id;
    return id ? tx.tenant.findUnique({ where: { id } }) : null;
  }

  private ignore(event: Stripe.Event, reason: string): Applied {
    this.logger.warn({ eventId: event.id, type: event.type }, `Ignored Stripe event: ${reason}`);
    return {};
  }

  private async notifyPaymentFailed(tenant: Tenant): Promise<void> {
    const owners = await this.prisma.unscoped.membership.findMany({
      where: { tenantId: tenant.id, role: 'OWNER' },
      select: { user: { select: { email: true } } },
    });
    try {
      await Promise.all(
        owners.map(({ user }) =>
          this.mail.sendPaymentFailed(user.email, { tenantName: tenant.name, tenantId: tenant.id }),
        ),
      );
    } catch (error) {
      // The event is already recorded; Stripe also emails the customer about the failure.
      this.logger.error({ err: error, tenantId: tenant.id }, 'Payment failure email not sent');
    }
  }
}

/** Stripe fields that hold either an id or the expanded object. */
function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}
