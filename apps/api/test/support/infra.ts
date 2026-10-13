import { type Env, loadEnv } from '../../src/config/env';

/** Environment pointing at the containers started by global-setup.ts. */
export function testEnv(): Env {
  return loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    REDIS_URL: process.env.TEST_REDIS_URL,
    RABBITMQ_URL: process.env.TEST_RABBITMQ_URL,
    JWT_SECRET: 'integration-test-secret-that-is-long-enough',
    COOKIE_SECURE: 'false',
    WEB_ORIGIN: 'http://localhost:3000',
  });
}
