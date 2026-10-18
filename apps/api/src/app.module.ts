import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditModule } from './audit/audit.module';
import { AccessTokenGuard } from './auth/access-token.guard';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CsrfGuard } from './common/http/csrf.guard';
import { CustomersModule } from './customers/customers.module';
import { ConfigModule } from './config/config.module';
import { type Env } from './config/env';
import { HealthModule } from './health/health.module';
import { InfraModule } from './infra/infra.module';
import { MailModule } from './mail/mail.module';
import { PointsModule } from './points/points.module';
import { PortalModule } from './portal/portal.module';
import { ProgramModule } from './program/program.module';
import { RewardsModule } from './rewards/rewards.module';
import { TeamModule } from './team/team.module';
import { TenantAccessGuard } from './tenancy/tenant-access.guard';
import { TenantContextInterceptor } from './tenancy/tenant-context.interceptor';
import { TenantsModule } from './tenants/tenants.module';

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
        MailModule,
        AuditModule,
        AuthModule,
        HealthModule,
        TenantsModule,
        TeamModule,
        PointsModule,
        ProgramModule,
        CustomersModule,
        RewardsModule,
        AnalyticsModule,
        PortalModule,
        BillingModule,
      ],
      // Global guards run in this order: CSRF header → session → tenant membership/role.
      providers: [
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: AccessTokenGuard },
        { provide: APP_GUARD, useClass: TenantAccessGuard },
        { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
      ],
    };
  }
}
