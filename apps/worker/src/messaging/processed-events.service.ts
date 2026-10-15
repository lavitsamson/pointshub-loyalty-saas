import { Injectable } from '@nestjs/common';
import type { Prisma } from '@pointshub/db';
import { PrismaService } from '../infra/prisma.service';

/** Long enough for an SMTP round trip inside a notification handler. */
const HANDLER_TIMEOUT_MS = 15_000;

/**
 * Consumer-side idempotency. RabbitMQ delivers at least once (and the relay may publish an
 * event twice after a crash), so each consumer records the events it has handled.
 */
@Injectable()
export class ProcessedEventsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs `fn` unless this consumer has already handled the event. The marker row is
   * inserted in the same transaction as the handler's writes, so they commit together.
   * A concurrent duplicate blocks on the unique index until the first commits, then sees
   * the row and skips. Returns false for a duplicate.
   */
  async runOnce(
    consumer: string,
    eventId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<boolean> {
    return this.prisma.client.$transaction(
      async (tx) => {
        const { count } = await tx.processedEvent.createMany({
          data: [{ consumer, eventId }],
          skipDuplicates: true,
        });
        if (count === 0) return false;
        await fn(tx);
        return true;
      },
      { timeout: HANDLER_TIMEOUT_MS },
    );
  }
}
