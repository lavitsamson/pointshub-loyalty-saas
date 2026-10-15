import { type DynamicModule, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { ENV, type Env } from './config/env';
import { NotificationsConsumer } from './consumers/notifications/notifications.consumer';
import { StatsConsumer } from './consumers/stats/stats.consumer';
import { PrismaService } from './infra/prisma.service';
import { RedisLockService } from './infra/redis-lock.service';
import { RedisService } from './infra/redis.service';
import { ExpiryWarningsService } from './jobs/expiry-warnings.service';
import { PointsExpiryService } from './jobs/points-expiry.service';
import { ScheduledJobs } from './jobs/scheduled-jobs';
import { MAIL_TRANSPORT, SmtpMailTransport } from './mail/mail-transport';
import { ConsumerHostService } from './messaging/consumer-host.service';
import { EVENT_CONSUMERS, type EventConsumer } from './messaging/event-consumer';
import { ProcessedEventsService } from './messaging/processed-events.service';
import { RabbitMqService } from './messaging/rabbitmq.service';
import { EVENT_PUBLISHER } from './outbox/event-publisher';
import { OutboxRelayService } from './outbox/outbox-relay.service';

/**
 * Root module of the background worker: the outbox relay, the event consumers and the
 * scheduled jobs, all in one process. Each part scales out by running more instances.
 */
@Module({})
export class WorkerModule {
  static register(env: Env): DynamicModule {
    return {
      module: WorkerModule,
      global: true,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            transport:
              env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true } }
                : undefined,
          },
        }),
        ScheduleModule.forRoot(),
      ],
      providers: [
        { provide: ENV, useValue: env },
        PrismaService,
        RedisService,
        RedisLockService,
        { provide: MAIL_TRANSPORT, useFactory: () => new SmtpMailTransport(env) },

        // Messaging
        RabbitMqService,
        { provide: EVENT_PUBLISHER, useExisting: RabbitMqService },
        ProcessedEventsService,
        ConsumerHostService,
        OutboxRelayService,

        // Consumers
        StatsConsumer,
        NotificationsConsumer,
        {
          provide: EVENT_CONSUMERS,
          inject: [StatsConsumer, NotificationsConsumer],
          useFactory: (...consumers: EventConsumer[]) => consumers,
        },

        // Scheduled jobs
        PointsExpiryService,
        ExpiryWarningsService,
        ScheduledJobs,
      ],
      exports: [ENV],
    };
  }
}
