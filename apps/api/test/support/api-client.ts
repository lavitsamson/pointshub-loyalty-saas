import type { NestExpressApplication } from '@nestjs/platform-express';
import type { MeResponse } from '@pointshub/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';

const PREFIX = '/api/v1';

/**
 * A browser-like client: keeps cookies between requests and sends the CSRF header on
 * state-changing requests, as the web app does.
 */
export class ApiClient {
  readonly agent: TestAgent;

  constructor(app: NestExpressApplication) {
    this.agent = request.agent(app.getHttpServer());
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

/** Registers a new owner with their own business and returns a signed-in client. */
export async function registerOwner(
  app: NestExpressApplication,
  businessName = `Business ${randomUUID().slice(0, 6)}`,
): Promise<Owner> {
  const client = new ApiClient(app);
  const email = uniqueEmail('owner');
  const res = await client
    .post('/auth/register', { name: 'Test Owner', email, password: TEST_PASSWORD, businessName })
    .expect(201);
  const me = res.body as MeResponse;
  return { client, userId: me.user.id, tenantId: me.memberships[0]!.tenantId, email };
}
