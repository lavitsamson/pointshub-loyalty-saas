import type { PrismaService } from '../infra/prisma.service';
import type { RabbitMqService } from '../infra/rabbitmq.service';
import type { RedisService } from '../infra/redis.service';
import { HealthService } from './health.service';

const up = () => ({ ping: () => Promise.resolve() });
const down = () => ({ ping: () => Promise.reject(new Error('unreachable')) });
const hanging = () => ({ ping: () => new Promise<void>(() => undefined) });

function service(db: object, redis: object, rabbit: object) {
  return new HealthService(db as PrismaService, redis as RedisService, rabbit as RabbitMqService);
}

describe('HealthService.readiness', () => {
  it('is ok when every dependency answers', async () => {
    await expect(service(up(), up(), up()).readiness()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up', rabbitmq: 'up' },
    });
  });

  it('reports which dependency is down', async () => {
    await expect(service(up(), down(), up()).readiness()).resolves.toEqual({
      status: 'error',
      checks: { database: 'up', redis: 'down', rabbitmq: 'up' },
    });
  });

  it('treats a check that never answers as down', async () => {
    jest.useFakeTimers();
    try {
      const report = service(hanging(), up(), up()).readiness();
      await jest.advanceTimersByTimeAsync(2_000);
      await expect(report).resolves.toMatchObject({
        status: 'error',
        checks: { database: 'down' },
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
