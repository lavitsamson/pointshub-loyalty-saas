import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@pointshub/db';
import { type Env, loadEnv } from '../../src/config/env';
import { PrismaService } from '../../src/infra/prisma.service';
import {
  MAIL_TRANSPORT,
  type MailMessage,
  type MailTransport,
} from '../../src/mail/mail-transport';
import { RabbitMqService } from '../../src/messaging/rabbitmq.service';
import { WorkerModule } from '../../src/worker.module';

/** Environment pointing at the containers started by global-setup.ts. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    REDIS_URL: process.env.TEST_REDIS_URL,
    RABBITMQ_URL: process.env.TEST_RABBITMQ_URL,
    WEB_ORIGIN: 'http://localhost:3000',
    OUTBOX_POLL_INTERVAL_MS: '50',
    // Fast retries, so a message reaches the dead-letter queue within a test.
    CONSUMER_RETRY_DELAYS_MS: '50,50,50,50,50',
    ...overrides,
  });
}

/** Keeps sent emails in memory. */
export class Mailbox implements MailTransport {
  readonly messages: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }

  to(address: string): MailMessage[] {
    return this.messages.filter((m) => m.to === address);
  }
}

export interface TestWorker {
  mailbox: Mailbox;
  prisma: PrismaClient;
  get<T>(type: new (...args: never[]) => T): T;
  close(): Promise<void>;
}

/** Boots the whole worker (relay, consumers, jobs) and waits until it is connected. */
export async function startWorker(env: Env = testEnv()): Promise<TestWorker> {
  const mailbox = new Mailbox();
  const moduleRef = await Test.createTestingModule({ imports: [WorkerModule.register(env)] })
    .overrideProvider(MAIL_TRANSPORT)
    .useValue(mailbox)
    .compile();
  // Expected failures (retries, dead letters) would otherwise flood the test output.
  moduleRef.useLogger(env.LOG_LEVEL === 'silent' ? false : ['error', 'warn']);
  await moduleRef.init();
  await moduleRef.get(RabbitMqService).ready();

  return {
    mailbox,
    prisma: moduleRef.get(PrismaService).client,
    get: (type) => moduleRef.get(type),
    close: () => moduleRef.close(),
  };
}

/** Polls until `check` stops throwing, then returns its result. */
export async function eventually<T>(check: () => Promise<T> | T, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
