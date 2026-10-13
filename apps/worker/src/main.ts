import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import path from 'node:path';
import { loadEnv } from './config/env';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  try {
    process.loadEnvFile(path.resolve(__dirname, '../../../.env'));
  } catch {
    // No .env file: the environment is provided by the platform.
  }
  const env = loadEnv();

  // A standalone application context: no HTTP server, just providers and lifecycle hooks.
  const app = await NestFactory.createApplicationContext(WorkerModule.register(env), {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.enableShutdownHooks();
  await app.init();

  logger.log('Worker started');
}

void bootstrap();
