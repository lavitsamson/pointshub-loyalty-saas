import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infra/prisma.service';
import { RabbitMqService } from '../infra/rabbitmq.service';
import { RedisService } from '../infra/redis.service';

export type DependencyStatus = 'up' | 'down';

export interface ReadinessReport {
  status: 'ok' | 'error';
  checks: Record<string, DependencyStatus>;
}

export interface Pingable {
  ping(): Promise<void>;
}

const CHECK_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  private readonly dependencies: Record<string, Pingable>;

  constructor(prisma: PrismaService, redis: RedisService, rabbitMq: RabbitMqService) {
    this.dependencies = { database: prisma, redis, rabbitmq: rabbitMq };
  }

  /** Pings every dependency in parallel; any failure or timeout makes the instance not ready. */
  async readiness(): Promise<ReadinessReport> {
    const entries = await Promise.all(
      Object.entries(this.dependencies).map(
        async ([name, dependency]) => [name, await probe(dependency)] as const,
      ),
    );
    const checks = Object.fromEntries(entries);
    const status = entries.every(([, s]) => s === 'up') ? 'ok' : 'error';
    return { status, checks };
  }
}

async function probe(dependency: Pingable): Promise<DependencyStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([dependency.ping(), timeout]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}
