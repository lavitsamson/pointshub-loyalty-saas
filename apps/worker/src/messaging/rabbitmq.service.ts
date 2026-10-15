import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { EVENTS_EXCHANGE, type EventEnvelope } from '@pointshub/shared';
import {
  type ChannelModel,
  type ConfirmChannel,
  connect,
  type Options,
  type RecoveringChannelModel,
} from 'amqplib';
import { ENV, type Env } from '../config/env';
import { EVENT_CONSUMERS, type EventConsumer } from './event-consumer';
import { assertTopology } from './topology';

export type ConnectListener = (model: ChannelModel) => Promise<void>;

/**
 * The worker's broker connection. amqplib's recovery reconnects with backoff, and `setup`
 * runs after every (re)connect: it declares the topology, opens a confirm channel for
 * publishing and lets listeners (the consumer host) open their channels again.
 *
 * Publishing waits for broker confirms, so "published" means RabbitMQ has the message.
 */
@Injectable()
export class RabbitMqService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RabbitMqService.name);
  private readonly listeners: ConnectListener[] = [];
  private model: RecoveringChannelModel | undefined;
  private publisher: ConfirmChannel | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(EVENT_CONSUMERS) private readonly consumers: readonly EventConsumer[],
  ) {}

  /** Registers work to redo on every (re)connect. Call before the application bootstraps. */
  onConnect(listener: ConnectListener): void {
    this.listeners.push(listener);
  }

  async onApplicationBootstrap(): Promise<void> {
    // Do not wait for the first connection: scheduled jobs only need the database, and the
    // outbox simply accumulates until the broker is reachable.
    this.model = await connect(this.env.RABBITMQ_URL, {
      recovery: {
        waitForConnect: false,
        maxDelay: 10_000,
        setup: (model: ChannelModel) => this.setup(model),
      },
    });
    this.model.on('connect', () => this.logger.log('Connected to RabbitMQ'));
    this.model.on('disconnect', (err: Error) => {
      this.publisher = undefined;
      this.logger.warn(`RabbitMQ connection lost: ${err.message}`);
    });
    this.model.on('connect-failed', (err: Error) => {
      this.logger.warn(`RabbitMQ connection attempt failed: ${err.message}`);
    });
  }

  /** Resolves once connected and set up; used by tests and to sequence startup. */
  async ready(): Promise<void> {
    await this.model?.waitForConnect();
  }

  get connected(): boolean {
    return this.publisher !== undefined;
  }

  /** Publishes events to the exchange, routed by type, and waits for the broker to confirm. */
  async publishEvents(events: readonly EventEnvelope[]): Promise<void> {
    const channel = this.requirePublisher();
    for (const event of events) {
      channel.publish(EVENTS_EXCHANGE, event.type, Buffer.from(JSON.stringify(event)), {
        persistent: true,
        contentType: 'application/json',
        messageId: event.id,
        type: event.type,
        timestamp: Math.floor(Date.parse(event.occurredAt) / 1000),
      });
    }
    await channel.waitForConfirms();
  }

  /** Sends a message straight to a queue (retries, dead letters) and waits for the confirm. */
  async sendToQueue(queue: string, content: Buffer, options: Options.Publish): Promise<void> {
    const channel = this.requirePublisher();
    await new Promise<void>((resolve, reject) => {
      channel.sendToQueue(queue, content, { persistent: true, ...options }, (err: unknown) =>
        err
          ? reject(err instanceof Error ? err : new Error('Broker rejected the message'))
          : resolve(),
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.model?.close();
  }

  private async setup(model: ChannelModel): Promise<void> {
    const channel = await model.createChannel();
    await assertTopology(channel, this.consumers);
    await channel.close();

    // Consumers need the publisher to park failed messages for retry, so it comes first.
    this.publisher = await model.createConfirmChannel();
    for (const listener of this.listeners) await listener(model);
  }

  private requirePublisher(): ConfirmChannel {
    if (!this.publisher) throw new Error('Not connected to RabbitMQ');
    return this.publisher;
  }
}
