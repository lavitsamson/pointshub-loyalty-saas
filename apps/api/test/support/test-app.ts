import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { BILLING_GATEWAY, type BillingGateway } from '../../src/billing/billing-gateway';
import { configureApp } from '../../src/app.setup';
import type { Env } from '../../src/config/env';
import { PrismaService } from '../../src/infra/prisma.service';
import {
  MAIL_TRANSPORT,
  type MailMessage,
  type MailTransport,
} from '../../src/mail/mail-transport';
import { testEnv } from './infra';

/** Keeps sent emails in memory so tests can follow reset and invitation links. */
export class Mailbox implements MailTransport {
  readonly messages: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }

  /** The most recent message to `to`; fails the test if there is none. */
  lastTo(to: string): MailMessage {
    const message = this.messages.filter((m) => m.to === to).at(-1);
    if (!message) throw new Error(`No email was sent to ${to}`);
    return message;
  }

  /** Extracts the token from the link in the most recent message to `to`. */
  tokenFor(to: string, pattern: RegExp): string {
    const match = pattern.exec(this.lastTo(to).text);
    if (!match?.[1]) throw new Error(`No link matching ${pattern} in email to ${to}`);
    return decodeURIComponent(match[1]);
  }
}

export interface TestApp {
  app: NestExpressApplication;
  mailbox: Mailbox;
  prisma: PrismaService;
  close(): Promise<void>;
}

export interface TestAppOptions {
  env?: Env;
  /** Stands in for Stripe; without it billing is off, as when no Stripe keys are set. */
  billingGateway?: BillingGateway;
}

/** Boots the full application, with the production middleware stack, against the test containers. */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const env = options.env ?? testEnv();
  const mailbox = new Mailbox();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(env)],
  })
    .overrideProvider(MAIL_TRANSPORT)
    .useValue(mailbox)
    .overrideProvider(BILLING_GATEWAY)
    .useValue(options.billingGateway ?? null)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    rawBody: true,
  });
  configureApp(app, env);
  await app.init();

  return { app, mailbox, prisma: app.get(PrismaService), close: () => app.close() };
}
