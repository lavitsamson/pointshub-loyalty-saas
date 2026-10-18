import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type BillingOverview, type BillingRedirect, Permission } from '@pointshub/shared';
import { CurrentTenant, RequirePermission } from '../tenancy/decorators';
import type { TenantContext } from '../tenancy/tenant-context';
import { BillingService } from './billing.service';

@ApiTags('billing')
@Controller('tenants/:tenantId/billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @ApiOperation({ summary: 'Plan, subscription status and usage against the plan limits' })
  overview(@CurrentTenant() tenant: TenantContext): Promise<BillingOverview> {
    return this.billing.overview(tenant.tenantId);
  }

  @Post('checkout')
  @RequirePermission(Permission.ManageBilling)
  @ApiOperation({ summary: 'Start a Stripe Checkout session for the Pro plan' })
  checkout(@CurrentTenant() tenant: TenantContext): Promise<BillingRedirect> {
    return this.billing.checkout(tenant);
  }

  @Post('portal')
  @RequirePermission(Permission.ManageBilling)
  @ApiOperation({ summary: 'Open the Stripe Billing Portal' })
  portal(@CurrentTenant() tenant: TenantContext): Promise<BillingRedirect> {
    return this.billing.portal(tenant);
  }
}
