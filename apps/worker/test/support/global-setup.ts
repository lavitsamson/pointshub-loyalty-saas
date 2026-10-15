import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RabbitMQContainer } from '@testcontainers/rabbitmq';
import { RedisContainer } from '@testcontainers/redis';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const DB_PACKAGE_DIR = path.resolve(__dirname, '../../../../packages/db');

/**
 * Starts Postgres, Redis and RabbitMQ once for the whole integration run and applies the
 * real migrations. Test files share the containers and create their own tenants.
 */
export default async function globalSetup(): Promise<void> {
  const [postgres, redis, rabbitMq] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
    new RabbitMQContainer('rabbitmq:4-alpine').start(),
  ]);

  process.env.TEST_DATABASE_URL = postgres.getConnectionUri();
  process.env.TEST_REDIS_URL = redis.getConnectionUrl();
  process.env.TEST_RABBITMQ_URL = rabbitMq.getAmqpUrl();

  const prismaCli = require.resolve('prisma/build/index.js', { paths: [DB_PACKAGE_DIR] });
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: DB_PACKAGE_DIR,
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    stdio: 'pipe',
  });

  (globalThis as Record<string, unknown>).__TEST_CONTAINERS__ = [postgres, redis, rabbitMq];
}
