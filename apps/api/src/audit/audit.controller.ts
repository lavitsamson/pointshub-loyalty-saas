import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AuditLogEntry,
  type Paginated,
  PaginationQuerySchema,
  type PaginationQuery,
} from '@pointshub/shared';
import { afterCursor, NEWEST_FIRST, orderBy, toPage } from '../common/pagination/cursor';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import { RequirePermission } from '../tenancy/decorators';
import { Permission } from '../tenancy/permissions';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller('tenants/:tenantId/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission(Permission.ViewAuditLog)
  @ApiOperation({ summary: 'Admin actions in this business, newest first' })
  async list(
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
  ): Promise<Paginated<AuditLogEntry>> {
    const rows = await this.audit.list({
      where: afterCursor(NEWEST_FIRST, query.cursor),
      orderBy: orderBy(NEWEST_FIRST),
      take: query.limit + 1,
    });
    return toPage(rows, query.limit, NEWEST_FIRST, (row) => ({
      id: row.id,
      actorUserId: row.actorUserId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      before: row.before,
      after: row.after,
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
