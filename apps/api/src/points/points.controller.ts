import { Body, Controller, Headers, Param, Post, Res } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AdjustPointsSchema,
  type AdjustPointsInput,
  IDEMPOTENCY_KEY_HEADER,
  type LedgerEntry,
  Permission,
  type PurchaseResult,
  RecordPurchaseSchema,
  type RecordPurchaseInput,
} from '@pointshub/shared';
import type { Response } from 'express';
import { ReqMeta, type RequestMeta } from '../auth/decorators';
import { ResourceIdPipe } from '../common/http/resource-id.pipe';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import { CurrentTenant, RequirePermission } from '../tenancy/decorators';
import type { TenantContext } from '../tenancy/tenant-context';
import { AdjustmentsService } from './adjustments.service';
import { PurchasesService } from './purchases.service';

@ApiTags('points')
@Controller('tenants/:tenantId')
export class PointsController {
  constructor(
    private readonly purchases: PurchasesService,
    private readonly adjustments: AdjustmentsService,
  ) {}

  @Post('purchases')
  @RequirePermission(Permission.RecordPurchase)
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Unique per purchase' })
  @ApiOperation({ summary: 'Record a purchase and award points (idempotent)' })
  async recordPurchase(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(RecordPurchaseSchema)) body: RecordPurchaseInput,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PurchaseResult> {
    const { result, replayed } = await this.purchases.record(tenant, body, idempotencyKey);
    if (replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result;
  }

  @Post('customers/:customerId/adjustments')
  @RequirePermission(Permission.AdjustPoints)
  @ApiOperation({ summary: 'Manually add or remove points, with a reason' })
  adjust(
    @CurrentTenant() tenant: TenantContext,
    @Param('customerId', new ResourceIdPipe('Customer')) customerId: string,
    @Body(new ZodValidationPipe(AdjustPointsSchema)) body: AdjustPointsInput,
    @ReqMeta() meta: RequestMeta,
  ): Promise<LedgerEntry> {
    return this.adjustments.adjust(tenant, customerId, body, meta);
  }
}
