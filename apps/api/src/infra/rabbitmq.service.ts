import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { connect, type RecoveringChannelModel } from 'amqplib';
import { ENV, type Env } from '../config/env';

/**
 * Holds the API's broker connection. amqplib's built-in recovery reconnects with
 * backoff, so the API keeps serving requests while the broker is briefly unavailable;
 * readiness reports it as down until the connection is back.
 */
@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private model: RecoveringChannelModel | undefined;
  private connected = false;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async onModuleInit(): Promise<void> {
    this.model = await connect(this.env.RABBITMQ_URL, {
      recovery: { waitForConnect: false, maxDelay: 10_000 },
    });
    this.model.on('connect', () => {
      this.connected = true;
      this.logger.log('Connected to RabbitMQ');
    });
    this.model.on('disconnect', (err: Error) => {
      this.connected = false;
      this.logger.warn(`RabbitMQ connection lost: ${err.message}`);
    });
    this.model.on('connect-failed', (err: Error) => {
      this.logger.warn(`RabbitMQ connection attempt failed: ${err.message}`);
    });
  }

  ping(): Promise<void> {
    return this.connected
      ? Promise.resolve()
      : Promise.reject(new Error('Not connected to RabbitMQ'));
  }

  async onModuleDestroy(): Promise<void> {
    await this.model?.close();
  }
}
