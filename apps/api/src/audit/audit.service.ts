import { Injectable } from '@nestjs/common';
import type { Prisma } from '@pointshub/db';
import type { RequestMeta } from '../auth/decorators';
import { PrismaService } from '../infra/prisma.service';

export interface AuditEntry {
  tenantId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  meta: RequestMeta;
}

/**
 * Anything that can create an audit row: the plain or tenant-scoped Prisma client, or an
 * interactive transaction of either.
 */
export interface AuditWriter {
  auditLog: {
    create(args: { data: Prisma.AuditLogUncheckedCreateInput }): PromiseLike<unknown>;
  };
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an admin mutation. Pass the transaction client so the entry commits or rolls
   * back together with the change it describes.
   */
  async record(db: AuditWriter, entry: AuditEntry): Promise<void> {
    await db.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorUserId: entry.actorUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before ?? undefined,
        after: entry.after ?? undefined,
        ip: entry.meta.ip,
        userAgent: entry.meta.userAgent,
      },
    });
  }

  list(args: Prisma.AuditLogFindManyArgs) {
    return this.prisma.scoped.auditLog.findMany(args);
  }
}
