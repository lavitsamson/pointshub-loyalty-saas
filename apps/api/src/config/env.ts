import { z } from 'zod';

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    RABBITMQ_URL: z.url(),
    WEB_ORIGIN: z.url().default('http://localhost:3000'),
    /**
     * Reverse proxies in front of the API (the web app's /api rewrite counts as one). Client
     * IPs for rate limits and the audit log are read from X-Forwarded-For this many hops back.
     */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    /** HMAC key for access, password-reset and invitation tokens. */
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    /** Set to false only for plain-HTTP local development. */
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    SMTP_HOST: z.string().min(1).default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    MAIL_FROM: z.string().min(1).default('PointsHub <no-reply@pointshub.local>'),
  })
  .refine((env) => env.NODE_ENV !== 'production' || !env.JWT_SECRET.startsWith('change-me'), {
    path: ['JWT_SECRET'],
    message: 'JWT_SECRET still has the example value',
  });

export type Env = z.infer<typeof EnvSchema>;

/** Injection token for the validated environment. */
export const ENV = Symbol('ENV');

/** Validates the environment once at startup so misconfiguration fails fast and loudly. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
