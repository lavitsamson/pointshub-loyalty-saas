import { Redis } from 'ioredis';
import path from 'node:path';

/**
 * Starts each local run with fresh rate-limit windows, as a newly started environment would
 * have. Every run signs up several businesses from one IP, so a few runs within an hour would
 * otherwise hit the sign-up limit. The limits themselves are tested in the API integration
 * suite. Skipped when the tests point at a deployment (E2E_BASE_URL).
 */
export default async function globalSetup(): Promise<void> {
  if (process.env.E2E_BASE_URL) return;
  try {
    process.loadEnvFile(path.resolve(__dirname, '../../../.env'));
  } catch {
    // No .env file: the environment is provided by the platform.
  }

  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'rate-limit:*', 'COUNT', 500);
      if (keys.length > 0) await redis.del(...keys);
      cursor = next;
    } while (cursor !== '0');
  } finally {
    redis.disconnect();
  }
}
