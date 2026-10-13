import { Injectable } from '@nestjs/common';
import { RedisService } from '../../infra/redis.service';
import { ProblemException } from '../http/problem.exception';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter in Redis. Shared across API instances, so limits hold when the
 * API is scaled horizontally. Fixed windows allow a burst at a window edge, which is
 * acceptable for login throttling and per-tenant AI quotas.
 */
@Injectable()
export class RateLimiterService {
  constructor(private readonly redis: RedisService) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const redisKey = `rate-limit:${key}`;
    const [[, count], [, ttl]] = (await this.redis.client
      .multi()
      .incr(redisKey)
      .ttl(redisKey)
      .exec()) as [[null, number], [null, number]];

    // First hit in this window (or a key left without expiry): start the window.
    if (ttl < 0) await this.redis.client.expire(redisKey, windowSeconds);
    const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds;

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds,
    };
  }

  /** Consumes one unit and throws a 429 problem when the limit is exceeded. */
  async enforce(key: string, limit: number, windowSeconds: number): Promise<void> {
    const result = await this.consume(key, limit, windowSeconds);
    if (!result.allowed) {
      throw new ProblemException({
        type: '/problems/rate-limited',
        title: 'Too many requests',
        status: 429,
        detail: `Try again in ${result.retryAfterSeconds} seconds.`,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }
  }
}
