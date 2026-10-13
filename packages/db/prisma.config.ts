import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma no longer loads .env files itself; read the repo-root .env when present.
try {
  process.loadEnvFile(path.resolve(__dirname, '../../.env'));
} catch {
  // No .env file: rely on the real environment (CI, containers).
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
