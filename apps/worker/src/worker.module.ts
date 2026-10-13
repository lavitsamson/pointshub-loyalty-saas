import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ENV, type Env } from './config/env';

/**
 * Root module of the background worker. Consumers (notifications, stats), the outbox
 * relay and scheduled jobs are registered here as they are built.
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
      ],
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
