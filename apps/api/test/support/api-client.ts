import type { NestExpressApplication } from '@nestjs/platform-express';
import type { MeResponse } from '@pointshub/shared';
import { randomInt, randomUUID } from 'node:crypto';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { MAIL_TRANSPORT } from '../../src/mail/mail-transport';
import type { Mailbox } from './test-app';

const PREFIX = '/api/v1';

/** A random private address, so each client counts as its own visitor for per-IP limits. */
export function randomIp(): string {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
}

/**
 * A browser-like client: keeps cookies between requests and sends the CSRF header on
 * state-changing requests, as the web app does. Each client has its own IP address, passed
 * as the proxy's X-Forwarded-For (the test environment trusts one proxy hop).
 */
export class ApiClient {
  readonly agent: TestAgent;

  constructor(
    app: NestExpressApplication,
    readonly ip: string = randomIp(),
  ) {
    this.agent = request.agent(app.getHttpServer()).set('X-Forwarded-For', ip);
  }

  get(path: string) {
    return this.agent.get(PREFIX + path);
  }

  post(path: string, body?: object) {
    return this.agent
      .post(PREFIX + path)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send(body);
  }

  patch(path: string, body?: object) {
    return this.agent
      .patch(PREFIX + path)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send(body);
  }

  delete(path: string) {
    return this.agent.delete(PREFIX + path).set('X-Requested-With', 'XMLHttpRequest');
  }
}

export const TEST_PASSWORD = 'correct horse battery staple';

export function uniqueEmail(label = 'user'): string {
  return `${label}-${randomUUID().slice(0, 8)}@example.test`;
}

export interface Owner {
  client: ApiClient;
  userId: string;
  tenantId: string;
  email: string;
}

export const SIGNUP_LINK = /\/register\/complete\?token=([^\s]+)/;

/**
 * Signs up a new owner with their own business, as a person would: asks to sign up, follows
 * the emailed link and chooses a password. Returns them signed in.
 */
export async function registerOwner(
  app: NestExpressApplication,
  businessName = `Business ${randomUUID().slice(0, 6)}`,
  email = uniqueEmail('owner'),
): Promise<Owner> {
  const client = new ApiClient(app);
  await client.post('/auth/register', { name: 'Test Owner', email, businessName }).expect(202);
  const token = app.get<Mailbox>(MAIL_TRANSPORT).tokenFor(email, SIGNUP_LINK);
  const res = await client
    .post('/auth/complete-registration', { token, password: TEST_PASSWORD })
    .expect(201);
  const me = res.body as MeResponse;
  return { client, userId: me.user.id, tenantId: me.memberships[0]!.tenantId, email };
}
