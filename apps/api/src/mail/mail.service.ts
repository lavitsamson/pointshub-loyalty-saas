import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { MAIL_TRANSPORT, type MailTransport } from './mail-transport';

/** Transactional emails sent while the user waits (password reset, invitations). */
@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    @Inject(ENV) private readonly env: Env,
  ) {}

  sendPasswordReset(to: string, token: string): Promise<void> {
    const link = `${this.env.WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
    return this.transport.send({
      to,
      subject: 'Reset your PointsHub password',
      text: [
        'Someone asked to reset the password for this PointsHub account.',
        '',
        `Choose a new password: ${link}`,
        '',
        'The link expires in 30 minutes. If this was not you, ignore this email.',
      ].join('\n'),
    });
  }

  /**
   * A link to choose a portal password. Sent when a customer asks to reset theirs, and when
   * someone registers with an email the business already has, which is how customers enrolled
   * at the counter claim their account.
   */
  sendPortalPasswordLink(
    to: string,
    details: { businessName: string; slug: string; token: string; reason: 'register' | 'reset' },
  ): Promise<void> {
    const link = `${this.env.WEB_ORIGIN}/c/${details.slug}/set-password?token=${encodeURIComponent(details.token)}`;
    const intro =
      details.reason === 'register'
        ? `You already have a ${details.businessName} rewards account. Choose a password to start using it online.`
        : `Someone asked to reset the password for your ${details.businessName} rewards account.`;
    return this.transport.send({
      to,
      subject:
        details.reason === 'register'
          ? `Set up your ${details.businessName} rewards account`
          : `Reset your ${details.businessName} rewards password`,
      text: [
        intro,
        '',
        `Choose a password: ${link}`,
        '',
        'The link expires in 60 minutes. If this was not you, ignore this email.',
      ].join('\n'),
    });
  }

  sendInvitation(
    to: string,
    details: { tenantName: string; inviterName: string; role: string; token: string },
  ): Promise<void> {
    const link = `${this.env.WEB_ORIGIN}/invite/${encodeURIComponent(details.token)}`;
    return this.transport.send({
      to,
      subject: `${details.inviterName} invited you to ${details.tenantName} on PointsHub`,
      text: [
        `${details.inviterName} invited you to join ${details.tenantName} as ${details.role.toLowerCase()}.`,
        '',
        `Accept the invitation: ${link}`,
        '',
        'The link expires in 7 days.',
      ].join('\n'),
    });
  }
}
