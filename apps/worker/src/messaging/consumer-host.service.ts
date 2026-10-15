import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { type DomainEvent, parseEvent } from '@pointshub/shared';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { z } from 'zod';
import { ENV, type Env } from '../config/env';
import { EVENT_CONSUMERS, type EventConsumer } from './event-consumer';
import { ProcessedEventsService } from './processed-events.service';
import { RabbitMqService } from './rabbitmq.service';
import { onFailure, RETRY_COUNT_HEADER, retryCountOf } from './retry-policy';
import { queuesFor } from './topology';

/** Unacknowledged messages per consumer: enough to overlap I/O, small enough to stay fair. */
const PREFETCH = 10;

interface Subscription {
  channel: Channel;
  consumerTag: string;
}

/**
 * Runs each consumer on its own channel. For every message it:
 *
 *   1. parses and validates the event (a malformed message goes straight to the DLQ),
 *   2. runs the handler once per event, recorded in ProcessedEvent,
 *   3. acknowledges it, or on failure parks it in the next retry queue (or the DLQ once
 *      retries are used up) and then acknowledges the original.
 *
 * A message is only acknowledged after its successor has been confirmed by the broker, so
 * a crash at any point leads to redelivery, never to loss.
 */
@Injectable()
export class ConsumerHostService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConsumerHostService.name);
  private readonly subscriptions: Subscription[] = [];
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(EVENT_CONSUMERS) private readonly consumers: readonly EventConsumer[],
    private readonly rabbitMq: RabbitMqService,
    private readonly processedEvents: ProcessedEventsService,
  ) {}

  onModuleInit(): void {
    this.rabbitMq.onConnect((model) => this.subscribe(model));
  }

  /** Stops taking new messages and waits for the ones being handled. */
  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(
      this.subscriptions.map(({ channel, consumerTag }) => channel.cancel(consumerTag)),
    );
    await Promise.allSettled(this.inFlight);
  }

  private async subscribe(model: ChannelModel): Promise<void> {
    // Channels from a previous connection died with it.
    this.subscriptions.length = 0;
    for (const consumer of this.consumers) {
      const channel = await model.createChannel();
      await channel.prefetch(PREFETCH);
      const { consumerTag } = await channel.consume(queuesFor(consumer.name).main, (message) => {
        if (!message) return;
        const work = this.deliver(consumer, channel, message);
        this.inFlight.add(work);
        void work.finally(() => this.inFlight.delete(work));
      });
      this.subscriptions.push({ channel, consumerTag });
    }
  }

  private async deliver(
    consumer: EventConsumer,
    channel: Channel,
    message: ConsumeMessage,
  ): Promise<void> {
    let event: DomainEvent;
    try {
      event = parseEvent(JSON.parse(message.content.toString('utf8')));
    } catch (error) {
      return this.fail(consumer, channel, message, error, false);
    }

    try {
      if (consumer.eventTypes.includes(event.type)) {
        await this.processedEvents.runOnce(consumer.name, event.id, (tx) =>
          consumer.handle(event, tx),
        );
      }
    } catch (error) {
      return this.fail(consumer, channel, message, error, true);
    }
    this.settle(() => channel.ack(message));
  }

  /**
   * Acks and nacks throw if the channel closed while the message was being handled. The
   * broker has already requeued the message then, and the duplicate is harmless.
   */
  private settle(action: () => void): void {
    try {
      action();
    } catch (error) {
      this.logger.warn(`Could not settle message on a closed channel: ${String(error)}`);
    }
  }

  private async fail(
    consumer: EventConsumer,
    channel: Channel,
    message: ConsumeMessage,
    error: unknown,
    retryable: boolean,
  ): Promise<void> {
    const headers = message.properties.headers ?? {};
    const retryCount = retryCountOf(headers);
    const action = onFailure(queuesFor(consumer.name), this.env.CONSUMER_RETRY_DELAYS_MS, {
      retryCount,
      retryable,
    });
    const reason = describe(error);
    const context = `${consumer.name} failed on message ${String(message.properties.messageId)}`;

    try {
      await this.rabbitMq.sendToQueue(action.queue, message.content, {
        contentType: message.properties.contentType as string | undefined,
        messageId: message.properties.messageId as string | undefined,
        type: message.properties.type as string | undefined,
        headers: {
          ...headers,
          [RETRY_COUNT_HEADER]: action.kind === 'retry' ? action.retryCount : retryCount,
          'x-last-error': reason.slice(0, 500),
        },
        ...(action.kind === 'retry' && { expiration: String(action.delayMs) }),
      });
    } catch (publishError) {
      // Could not park it: hand it back to the broker so it is redelivered later.
      this.logger.error(`${context} and could not be rerouted: ${String(publishError)}`);
      this.settle(() => channel.nack(message, false, true));
      return;
    }
    this.settle(() => channel.ack(message));

    if (action.kind === 'retry') {
      this.logger.warn(
        `${context} (retry ${action.retryCount} in ${action.delayMs} ms): ${reason}`,
      );
    } else {
      this.logger.error(`${context}; moved to ${action.queue}: ${reason}`);
    }
  }
}

/** One readable line for logs and the x-last-error header. */
function describe(error: unknown): string {
  if (error instanceof z.ZodError) return z.prettifyError(error).replace(/\n/g, '; ');
  return error instanceof Error ? error.message : String(error);
}
