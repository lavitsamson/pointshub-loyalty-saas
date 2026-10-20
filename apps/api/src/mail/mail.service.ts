import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { MAIL_TRANSPORT, type MailTransport } from './mail-transport';

/** Transactional emails sent while the user waits (sign-up, password reset, invitations). */
@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** For a new address: following the link creates the account and the business. */
  sendSignupLink(to: string, details: { businessName: string; token: string }): Promise<void> {
    const link = `${this.env.WEB_ORIGIN}/register/complete?token=${encodeURIComponent(details.token)}`;
    return this.transport.send({
      to,
      subject: 'Finish creating your PointsHub account',
      text: [
        `Thanks for signing up ${details.businessName} to PointsHub.`,
        '',
        `Choose a password to finish: ${link}`,
        '',
        'The link expires in 60 minutes. If this was not you, ignore this email.',
      ].join('\n'),
    });
  }

  /** For an address that already has an account: the sign-up form must not say so. */
  sendSignupExistingAccount(to: string): Promise<void> {
    return this.transport.send({
      to,
      subject: 'You already have a PointsHub account',
      text: [
        'Someone tried to create a PointsHub account with this email address, which already has one.',
        '',
        `Sign in: ${this.env.WEB_ORIGIN}/login`,
        `Forgot your password? ${this.env.WEB_ORIGIN}/forgot-password`,
        '',
        'If this was not you, ignore this email.',
      ].join('\n'),
    });
  }

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
   * A link to choose a portal password, which finishes whatever the customer started:
   * - `join`: a new address joined the programme;
   * - `claim`: an address the business already has joined (e.g. enrolled at the counter);
   * - `reset`: a customer forgot their password.
   */
  sendPortalPasswordLink(
    to: string,
    details: {
      businessName: string;
      slug: string;
      token: string;
      reason: 'join' | 'claim' | 'reset';
    },
  ): Promise<void> {
    const link = `${this.env.WEB_ORIGIN}/c/${details.slug}/set-password?token=${encodeURIComponent(details.token)}`;
    const { businessName } = details;
    const content = {
      join: {
        subject: `Finish joining ${businessName} rewards`,
        intro: `Thanks for joining ${businessName} rewards. Choose a password to finish.`,
      },
      claim: {
        subject: `Set up your ${businessName} rewards account`,
        intro: `You already have a ${businessName} rewards account. Choose a password to start using it online.`,
      },
      reset: {
        subject: `Reset your ${businessName} rewards password`,
        intro: `Someone asked to reset the password for your ${businessName} rewards account.`,
      },
    }[details.reason];
    return this.transport.send({
      to,
      subject: content.subject,
      text: [
        content.intro,
        '',
        `Choose a password: ${link}`,
        '',
        'The link expires in 60 minutes. If this was not you, ignore this email.',
      ].join('\n'),
    });
  }

  /** Tells an owner that Stripe could not take the Pro payment. */
  sendPaymentFailed(to: string, details: { tenantName: string; tenantId: string }): Promise<void> {
    const link = `${this.env.WEB_ORIGIN}/app/${details.tenantId}/billing`;
    return this.transport.send({
      to,
      subject: `Payment failed for ${details.tenantName} on PointsHub`,
      text: [
        `We could not take the payment for the Pro plan of ${details.tenantName}.`,
        '',
        'Pro stays on while the payment is retried. To keep it, update your payment details:',
        link,
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
