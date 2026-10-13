import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import type { Env } from '../../src/config/env';

/** Boots the full Nest application against the given environment, with the production middleware stack. */
export async function createTestApp(env: Env): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(env)],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app, env);
  await app.init();
  return app;
}
