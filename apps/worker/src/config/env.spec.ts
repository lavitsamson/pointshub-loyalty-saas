import { loadEnv } from './env';

const required = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  RABBITMQ_URL: 'amqp://u:p@localhost:5672',
};

describe('loadEnv', () => {
  it('accepts a complete environment', () => {
    expect(loadEnv(required)).toMatchObject({
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      CONSUMER_RETRY_DELAYS_MS: [1000, 5000, 30000, 120000, 600000],
    });
  });

  it('fails fast when the broker URL is missing', () => {
    expect(() => loadEnv({ ...required, RABBITMQ_URL: undefined })).toThrow(/RABBITMQ_URL/);
  });

  it('parses custom retry delays', () => {
    expect(
      loadEnv({ ...required, CONSUMER_RETRY_DELAYS_MS: '10, 20,30,40,50' })
        .CONSUMER_RETRY_DELAYS_MS,
    ).toEqual([10, 20, 30, 40, 50]);
  });

  it('requires exactly one delay per retry', () => {
    expect(() => loadEnv({ ...required, CONSUMER_RETRY_DELAYS_MS: '10,20' })).toThrow(
      /CONSUMER_RETRY_DELAYS_MS/,
    );
    expect(() => loadEnv({ ...required, CONSUMER_RETRY_DELAYS_MS: '1,2,x,4,5' })).toThrow(
      /CONSUMER_RETRY_DELAYS_MS/,
    );
  });
});
