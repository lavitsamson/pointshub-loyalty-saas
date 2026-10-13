import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Tenant, UpdateTenantSchema, type UpdateTenantInput } from '@pointshub/shared';
import { ReqMeta, type RequestMeta } from '../auth/decorators';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import { CurrentTenant, RequirePermission } from '../tenancy/decorators';
import { Permission } from '../tenancy/permissions';
import type { TenantContext } from '../tenancy/tenant-context';
import { TenantsService } from './tenants.service';

@ApiTags('tenants')
@Controller('tenants/:tenantId')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @ApiOperation({ summary: 'The business the caller belongs to' })
  get(@CurrentTenant() tenant: TenantContext): Promise<Tenant> {
    return this.tenants.get(tenant.tenantId);
  }

  @Patch()
  @RequirePermission(Permission.UpdateTenant)
  @ApiOperation({ summary: 'Update business details' })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(UpdateTenantSchema)) body: UpdateTenantInput,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Tenant> {
    return this.tenants.update(tenant, body, meta);
  }
}
