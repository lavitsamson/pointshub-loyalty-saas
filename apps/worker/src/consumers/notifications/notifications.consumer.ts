import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@pointshub/db';
import type { DomainEvent } from '@pointshub/shared';
import { ENV, type Env } from '../../config/env';
import { MAIL_TRANSPORT, type MailMessage, type MailTransport } from '../../mail/mail-transport';
import type { EventConsumer } from '../../messaging/event-consumer';
import {
  pointsExpiringEmail,
  type Recipient,
  redemptionFulfilledEmail,
  tierChangedEmail,
} from './emails';

/**
 * Emails customers about things that happened to their account.
 *
 * The email is sent before the ProcessedEvent marker commits: if sending fails, the event
 * is retried; if the commit fails after a successful send, the customer may get the same
 * email twice. That is the right side to err on for a notification.
 */
@Injectable()
export class NotificationsConsumer implements EventConsumer {
  readonly name = 'notifications';
  readonly eventTypes = ['tier.changed', 'redemption.fulfilled', 'points.expiring'] as const;

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async handle(event: DomainEvent, tx: Prisma.TransactionClient): Promise<void> {
    const message = await this.compose(event, tx);
    if (message) await this.mail.send(message);
  }

  private async compose(
    event: DomainEvent,
    tx: Prisma.TransactionClient,
  ): Promise<MailMessage | null> {
    switch (event.type) {
      case 'tier.changed': {
        const to = await this.recipient(tx, event.tenantId, event.payload.customerId);
        return to && tierChangedEmail(to, event.payload.toTierName);
      }
      case 'redemption.fulfilled': {
        const to = await this.recipient(tx, event.tenantId, event.payload.customerId);
        const reward = await tx.reward.findFirst({
          where: { id: event.payload.rewardId, tenantId: event.tenantId },
          select: { name: true },
        });
        return to && reward && redemptionFulfilledEmail(to, reward.name);
      }
      case 'points.expiring': {
        const to = await this.recipient(tx, event.tenantId, event.payload.customerId);
        return to && pointsExpiringEmail(to, event.payload.points, event.payload.expiresOn);
      }
      default:
        return null;
    }
  }

  /** Null if the customer no longer exists; there is nobody to tell. */
  private async recipient(
    tx: Prisma.TransactionClient,
    tenantId: string,
    customerId: string,
  ): Promise<Recipient | null> {
    const customer = await tx.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { email: true, name: true, tenant: { select: { name: true, slug: true } } },
    });
    if (!customer) return null;
    return {
      email: customer.email,
      name: customer.name,
      businessName: customer.tenant.name,
      portalUrl: `${this.env.WEB_ORIGIN}/c/${customer.tenant.slug}`,
    };
  }
}
