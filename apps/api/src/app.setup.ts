import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ProblemDetailsFilter } from './common/http/problem-details.filter';
import type { Env } from './config/env';

export const API_PREFIX = 'api/v1';
const BODY_LIMIT = '100kb';

/**
 * Applies HTTP-level configuration. Shared by main.ts and the integration tests so
 * tests exercise the same middleware stack as production.
 */
export function configureApp(app: NestExpressApplication, env: Env): void {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX);
  app.useBodyParser('json', { limit: BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: BODY_LIMIT, extended: false });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();

  const openApi = new DocumentBuilder()
    .setTitle('PointsHub API')
    .setDescription('Multi-tenant loyalty and rewards platform')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, openApi));
}
