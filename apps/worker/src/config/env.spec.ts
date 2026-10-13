import { loadEnv } from './env';

describe('loadEnv', () => {
  it('accepts a complete environment', () => {
    expect(
      loadEnv({
        DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
        REDIS_URL: 'redis://localhost:6379',
        RABBITMQ_URL: 'amqp://u:p@localhost:5672',
      }),
    ).toMatchObject({ NODE_ENV: 'development', LOG_LEVEL: 'info' });
  });

  it('fails fast when the broker URL is missing', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
        REDIS_URL: 'redis://localhost:6379',
      }),
    ).toThrow(/RABBITMQ_URL/);
  });
});
