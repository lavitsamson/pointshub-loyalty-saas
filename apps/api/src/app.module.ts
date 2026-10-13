import { type DynamicModule, Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { type Env } from './config/env';
import { HealthModule } from './health/health.module';
import { InfraModule } from './infra/infra.module';

const REQUEST_ID_HEADER = 'x-request-id';

@Module({})
export class AppModule {
  static register(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            // Reuse an upstream request id (load balancer, web app) or mint one, and echo it back.
            genReqId: (req, res) => {
              const incoming = req.headers[REQUEST_ID_HEADER];
              const id =
                typeof incoming === 'string' && incoming.length <= 128 ? incoming : randomUUID();
              res.setHeader(REQUEST_ID_HEADER, id);
              return id;
            },
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
            ],
            autoLogging: { ignore: (req) => req.url?.includes('/health/') ?? false },
            transport:
              env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true } }
                : undefined,
          },
        }),
        InfraModule,
        HealthModule,
      ],
    };
  }
}
