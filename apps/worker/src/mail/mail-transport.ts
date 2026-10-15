import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/** SMTP delivery: Mailpit locally, any SMTP relay in production. */
export class SmtpMailTransport implements MailTransport {
  private readonly transporter: Transporter;

  constructor(private readonly env: Env) {
    this.transporter = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.env.MAIL_FROM, ...message });
  }
}
