import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RedisService } from './redis.service';

/** Deletes the key only if it still holds our token, so we never release someone else's lock. */
const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

export type LockOutcome<T> = { acquired: true; result: T } | { acquired: false };

/**
 * A single-holder lock in Redis (SET NX with an expiry). Every worker instance schedules the
 * same jobs; the lock makes sure only one of them actually runs each time.
 *
 * The expiry is a safety net for a crashed holder, so it must comfortably exceed the job's
 * running time: if it lapses mid-run, a second instance could start the same job.
 */
@Injectable()
export class RedisLockService {
  private readonly logger = new Logger(RedisLockService.name);

  constructor(private readonly redis: RedisService) {}

  async runExclusive<T>(
    name: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<LockOutcome<T>> {
    const key = `pointshub:lock:${name}`;
    const token = randomUUID();
    const acquired = await this.redis.client.set(key, token, 'PX', ttlMs, 'NX');
    if (acquired !== 'OK') {
      this.logger.log(`Skipping ${name}: another instance holds the lock`);
      return { acquired: false };
    }

    try {
      return { acquired: true, result: await fn() };
    } finally {
      await this.redis.client.eval(RELEASE_SCRIPT, 1, key, token);
    }
  }
}
