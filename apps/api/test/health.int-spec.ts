import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app';

describe('Health and HTTP basics', () => {
  let testApp: TestApp;
  let app: NestExpressApplication;

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await testApp?.close();
  });

  it('GET /health/live returns ok', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /health/ready reports every dependency as up', async () => {
    // The broker connection is established asynchronously after boot.
    await waitFor(async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health/ready');
      return res.status === 200;
    });

    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(res.body).toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up', rabbitmq: 'up' },
    });
  });

  it('echoes an incoming request id and mints one otherwise', async () => {
    const echoed = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('x-request-id', 'req-123');
    expect(echoed.headers['x-request-id']).toBe('req-123');

    const minted = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(minted.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('answers unknown routes with an RFC 9457 problem', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      instance: '/api/v1/does-not-exist',
    });
  });

  it('sets security headers', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('serves the OpenAPI document', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    const document = res.body as { info: { title: string }; paths: Record<string, unknown> };
    expect(document.info.title).toBe('PointsHub API');
    expect(Object.keys(document.paths)).toContain('/api/v1/health/ready');
  });
});

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Condition not met in time');
}
