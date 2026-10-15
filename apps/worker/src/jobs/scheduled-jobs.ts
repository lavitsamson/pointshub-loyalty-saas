import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisLockService } from '../infra/redis-lock.service';
import { RedisService } from '../infra/redis.service';
import { ExpiryWarningsService } from './expiry-warnings.service';
import { PointsExpiryService } from './points-expiry.service';

/** Far longer than either job should take; only matters if a holder dies mid-run. */
const JOB_LOCK_TTL_MS = 30 * 60 * 1000;
const TWO_DAYS_S = 2 * 24 * 60 * 60;

/**
 * Cron triggers. Every worker instance schedules these, and a Redis lock makes sure only
 * one instance runs each occurrence. All times are UTC.
 */
@Injectable()
export class ScheduledJobs {
  private readonly logger = new Logger(ScheduledJobs.name);

  constructor(
    private readonly lock: RedisLockService,
    private readonly redis: RedisService,
    private readonly expiry: PointsExpiryService,
    private readonly warnings: ExpiryWarningsService,
  ) {}

  /** Safe to run more than once: what is due is recomputed from the ledger. */
  @Cron('0 2 * * *', { name: 'points-expiry', timeZone: 'UTC' })
  async expirePoints(): Promise<void> {
    await this.guard('points-expiry', () => this.expiry.expireDue());
  }

  /**
   * Not naturally idempotent (each run raises new events, and so new emails), so a marker
   * records that today's run finished: a restart or a manual re-run later the same day
   * does nothing.
   */
  @Cron('0 9 * * *', { name: 'expiry-warnings', timeZone: 'UTC' })
  async warnExpiringSoon(now: Date = new Date()): Promise<void> {
    const marker = `pointshub:job:expiry-warnings:${now.toISOString().slice(0, 10)}`;
    await this.guard('expiry-warnings', async () => {
      if (await this.redis.client.exists(marker)) return;
      await this.warnings.warnExpiringSoon(now);
      await this.redis.client.set(marker, '1', 'EX', TWO_DAYS_S);
    });
  }

  /** Runs a job under its lock; errors are logged, as there is no caller to report to. */
  private async guard(name: string, job: () => Promise<unknown>): Promise<void> {
    try {
      await this.lock.runExclusive(name, JOB_LOCK_TTL_MS, job);
    } catch (error) {
      this.logger.error(`Scheduled job ${name} failed: ${String(error)}`);
    }
  }
}
