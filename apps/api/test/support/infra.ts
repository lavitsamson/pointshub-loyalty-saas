import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { type Env, loadEnv } from '../../src/config/env';

const DB_PACKAGE_DIR = path.resolve(__dirname, '../../../../packages/db');

export interface TestInfra {
  env: Env;
  stop(): Promise<void>;
}

/** Starts throwaway Postgres, Redis and RabbitMQ containers and applies all migrations. */
export async function startInfra(): Promise<TestInfra> {
  const [postgres, redis, rabbitMq] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
    new RabbitMQContainer('rabbitmq:4-alpine').start(),
  ]);

  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: postgres.getConnectionUri(),
    REDIS_URL: redis.getConnectionUrl(),
    RABBITMQ_URL: rabbitMq.getAmqpUrl(),
  });

  migrate(env.DATABASE_URL);

  return {
    env,
    stop: () => stopAll([postgres, redis, rabbitMq]),
  };
}

function migrate(databaseUrl: string): void {
  const prismaCli = require.resolve('prisma/build/index.js', { paths: [DB_PACKAGE_DIR] });
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: DB_PACKAGE_DIR,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}

async function stopAll(
  containers: Array<StartedPostgreSqlContainer | StartedRedisContainer | StartedRabbitMQContainer>,
): Promise<void> {
  await Promise.all(containers.map((c) => c.stop()));
}
