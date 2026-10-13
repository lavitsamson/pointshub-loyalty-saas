import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import path from 'node:path';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  try {
    process.loadEnvFile(path.resolve(__dirname, '../../../.env'));
  } catch {
    // No .env file: the environment is provided by the platform.
  }
  const env = loadEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(env), {
    bufferLogs: true,
    bodyParser: false,
  });
  configureApp(app, env);
  await app.listen(env.API_PORT);
}

void bootstrap();
