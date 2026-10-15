import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { EventEnvelope, EventType } from '@pointshub/shared';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../infra/prisma.service';
import { EVENT_PUBLISHER, type EventPublisher } from './event-publisher';

export const OUTBOX_BATCH_SIZE = 100;

interface OutboxRow {
  id: string;
  tenantId: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

/**
 * Moves events from the OutboxEvent table to RabbitMQ.
 *
 * Each batch is claimed with FOR UPDATE SKIP LOCKED, so several worker instances can relay
 * at once without publishing the same rows: each one skips rows another has locked. Rows
 * are marked published only after the broker confirms them, in the same transaction that
 * holds the lock. If anything fails, the transaction rolls back and the rows are retried;
 * an event can therefore be published twice, never lost, and consumers deduplicate.
 */
@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private stopped = false;
  private loop: Promise<void> | undefined;
  private wake: (() => void) | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    this.loop = this.run();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.wake?.();
    await this.loop;
  }

  /** Publishes up to one batch of pending events, oldest first. Returns how many. */
  async publishBatch(): Promise<number> {
    return this.prisma.client.$transaction(
      async (tx) => {
        // Cross-tenant by design: the relay serves every tenant.
        const rows = await tx.$queryRaw<OutboxRow[]>`
          SELECT id, "tenantId", type, payload, "occurredAt"
          FROM "OutboxEvent"
          WHERE "publishedAt" IS NULL
          ORDER BY "occurredAt", id
          LIMIT ${OUTBOX_BATCH_SIZE}
          FOR UPDATE SKIP LOCKED`;
        if (rows.length === 0) return 0;

        await this.publisher.publishEvents(rows.map(toEnvelope));
        await tx.outboxEvent.updateMany({
          where: { id: { in: rows.map((row) => row.id) } },
          data: { publishedAt: new Date() },
        });
        return rows.length;
      },
      { timeout: 30_000 },
    );
  }

  private async run(): Promise<void> {
    while (!this.stopped) {
      let published = 0;
      if (this.publisher.connected) {
        try {
          published = await this.publishBatch();
        } catch (error) {
          this.logger.warn(`Outbox relay batch failed, will retry: ${String(error)}`);
        }
      }
      // A full batch suggests a backlog: carry on straight away instead of waiting.
      if (published < OUTBOX_BATCH_SIZE) await this.pause(this.env.OUTBOX_POLL_INTERVAL_MS);
    }
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
}

/** Events are validated when written and again by every consumer, so no check here. */
function toEnvelope(row: OutboxRow): EventEnvelope {
  return {
    id: row.id,
    type: row.type as EventType,
    tenantId: row.tenantId,
    occurredAt: row.occurredAt.toISOString(),
    version: 1,
    payload: row.payload,
  };
}
