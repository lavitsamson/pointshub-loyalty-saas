import { loadEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  RABBITMQ_URL: 'amqp://u:p@localhost:5672',
  JWT_SECRET: 'x'.repeat(32),
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    expect(loadEnv(valid)).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 4000,
      LOG_LEVEL: 'info',
      ACCESS_TOKEN_TTL_SECONDS: 900,
      COOKIE_SECURE: true,
      TRUST_PROXY_HOPS: 0,
    });
  });

  it('coerces numbers and booleans', () => {
    const env = loadEnv({
      ...valid,
      API_PORT: '8080',
      COOKIE_SECURE: 'false',
      TRUST_PROXY_HOPS: '1',
    });
    expect(env.API_PORT).toBe(8080);
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.TRUST_PROXY_HOPS).toBe(1);
  });

  it('rejects a short signing secret', () => {
    expect(() => loadEnv({ ...valid, JWT_SECRET: 'too-short' })).toThrow(/JWT_SECRET/);
  });

  it('refuses the example secret in production', () => {
    const secret = 'change-me-to-a-long-random-string-of-48-bytes';
    expect(() => loadEnv({ ...valid, NODE_ENV: 'production', JWT_SECRET: secret })).toThrow(
      /example value/,
    );
    expect(loadEnv({ ...valid, JWT_SECRET: secret }).JWT_SECRET).toBe(secret);
  });

  describe('Stripe settings', () => {
    const stripe = {
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_123',
      STRIPE_PRO_PRICE_ID: 'price_123',
    };

    it('are optional, and empty values count as unset', () => {
      expect(loadEnv(valid).STRIPE_SECRET_KEY).toBeUndefined();
      const blank = { STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', STRIPE_PRO_PRICE_ID: '' };
      expect(loadEnv({ ...valid, ...blank }).STRIPE_SECRET_KEY).toBeUndefined();
    });

    it('are accepted together', () => {
      expect(loadEnv({ ...valid, ...stripe })).toMatchObject(stripe);
    });

    it('must be all set or none', () => {
      expect(() => loadEnv({ ...valid, STRIPE_SECRET_KEY: 'sk_test_123' })).toThrow(
        /set all of STRIPE_SECRET_KEY/,
      );
    });

    it('refuse a live-mode key', () => {
      expect(() => loadEnv({ ...valid, ...stripe, STRIPE_SECRET_KEY: 'sk_live_123' })).toThrow(
        /test-mode key/,
      );
    });
  });

  it('names every invalid variable in the error', () => {
    expect(() => loadEnv({ REDIS_URL: 'not a url' })).toThrow(
      /DATABASE_URL[\s\S]*REDIS_URL[\s\S]*RABBITMQ_URL/,
    );
  });
});
