import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@pointshub/db';
import { ENV, type Env } from '../config/env';

/**
 * The worker handles every tenant's events and jobs, so it has no request-scoped tenant
 * context and uses the plain client. Instead, every query on a tenant-owned table names the
 * tenant explicitly, taken from the event envelope or the job's per-tenant loop.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(ENV) env: Env) {
    this.client = createPrismaClient({ connectionString: env.DATABASE_URL });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
