import { loadEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  RABBITMQ_URL: 'amqp://u:p@localhost:5672',
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    expect(loadEnv(valid)).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 4000,
      LOG_LEVEL: 'info',
    });
  });

  it('coerces the port', () => {
    expect(loadEnv({ ...valid, API_PORT: '8080' }).API_PORT).toBe(8080);
  });

  it('names every invalid variable in the error', () => {
    expect(() => loadEnv({ REDIS_URL: 'not a url' })).toThrow(
      /DATABASE_URL[\s\S]*REDIS_URL[\s\S]*RABBITMQ_URL/,
    );
  });
});
