import { z } from 'zod';

/** Spec: a message that keeps failing goes to the dead-letter queue after 5 retries. */
export const RETRY_LEVELS = 5;

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  RABBITMQ_URL: z.url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** Used to build links in customer emails (the portal lives at /c/:tenantSlug). */
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_FROM: z.string().min(1).default('PointsHub <no-reply@pointshub.local>'),

  /** How often the outbox relay looks for new events when the previous batch was not full. */
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  /** Delay before each retry of a failed message, in milliseconds. */
  CONSUMER_RETRY_DELAYS_MS: z
    .string()
    .default('1000,5000,30000,120000,600000')
    .transform((value) => value.split(',').map((part) => Number(part.trim())))
    .pipe(
      z
        .array(z.number().int().positive())
        .length(RETRY_LEVELS, `Expected ${RETRY_LEVELS} comma-separated delays`),
    ),
});

export type Env = z.infer<typeof EnvSchema>;

export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
