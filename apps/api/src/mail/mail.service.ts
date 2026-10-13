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
