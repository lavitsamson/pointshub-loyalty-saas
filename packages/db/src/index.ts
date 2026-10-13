import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';

export interface CreatePrismaClientOptions {
  connectionString: string;
  /** Log every query; useful when debugging locally. */
  logQueries?: boolean;
}

export function createPrismaClient({
  connectionString,
  logQueries = false,
}: CreatePrismaClientOptions) {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: logQueries ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}
