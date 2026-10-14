import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Campaign,
  CreateCampaignSchema,
  type CreateCampaignInput,
  CreateTierSchema,
  type CreateTierInput,
  type LoyaltyProgram,
  type Paginated,
  PaginationQuerySchema,
  type PaginationQuery,
  Permission,
  type Tier,
  UpdateCampaignSchema,
  type UpdateCampaignInput,
  UpdateLoyaltyProgramSchema,
  type UpdateLoyaltyProgramInput,
  UpdateTierSchema,
  type UpdateTierInput,
} from '@pointshub/shared';
import { ReqMeta, type RequestMeta } from '../auth/decorators';
import { ResourceIdPipe } from '../common/http/resource-id.pipe';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import { CurrentTenant, RequirePermission } from '../tenancy/decorators';
import type { TenantContext } from '../tenancy/tenant-context';
import { ProgramService } from './program.service';

const Pagination = new ZodValidationPipe(PaginationQuerySchema);

@ApiTags('program')
@Controller('tenants/:tenantId')
export class ProgramController {
  constructor(private readonly program: ProgramService) {}

  @Get('program')
  @ApiOperation({ summary: 'Earning rate, currency and expiry rules' })
  getProgram(): Promise<LoyaltyProgram> {
    return this.program.getProgram();
  }

  @Patch('program')
  @RequirePermission(Permission.ManageProgram)
  @ApiOperation({ summary: 'Change the earning rate or expiry period' })
  updateProgram(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(UpdateLoyaltyProgramSchema)) body: UpdateLoyaltyProgramInput,
    @ReqMeta() meta: RequestMeta,
  ): Promise<LoyaltyProgram> {
    return this.program.updateProgram(tenant, body, meta);
  }

  @Get('tiers')
  @ApiOperation({ summary: 'Tiers, lowest threshold first' })
  listTiers(@Query(Pagination) query: PaginationQuery): Promise<Paginated<Tier>> {
    return this.program.listTiers(query);
  }

  @Post('tiers')
  @RequirePermission(Permission.ManageProgram)
  @ApiOperation({ summary: 'Add a tier' })
  createTier(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(CreateTierSchema)) body: CreateTierInput,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Tier> {
    return this.program.createTier(tenant, body, meta);
  }

  @Patch('tiers/:tierId')
  @RequirePermission(Permission.ManageProgram)
  @ApiOperation({ summary: 'Edit a tier' })
  updateTier(
    @CurrentTenant() tenant: TenantContext,
    @Param('tierId', new ResourceIdPipe('Tier')) tierId: string,
    @Body(new ZodValidationPipe(UpdateTierSchema)) body: UpdateTierInput,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Tier> {
    return this.program.updateTier(tenant, tierId, body, meta);
  }

  @Delete('tiers/:tierId')
  @RequirePermission(Permission.ManageProgram)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a tier' })
  deleteTier(
    @CurrentTenant() tenant: TenantContext,
    @Param('tierId', new ResourceIdPipe('Tier')) tierId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.program.deleteTier(tenant, tierId, meta);
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'Campaigns, newest first' })
  listCampaigns(@Query(Pagination) query: PaginationQuery): Promise<Paginated<Campaign>> {
    return this.program.listCampaigns(query);
  }

  @Post('campaigns')
  @RequirePermission(Permission.ManageProgram)
  @ApiOperation({ summary: 'Schedule a points multiplier campaign' })
  createCampaign(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(CreateCampaignSchema)) body: CreateCampaignInput,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Campaign> {
    return this.program.createCampaign(tenant, body, meta);
  }

  @Patch('campaigns/:campaignId')
  @RequirePermission(Permission.ManageProgram)
  @ApiOperation({ summary: 'Edit or pause a campaign' })
  updateCampaign(
    @CurrentTenant() tenant: TenantContext,
    @Param('campaignId', new ResourceIdPipe('Campaign')) campaignId: string,
    @Body(new ZodValidationPipe(UpdateCampaignSchema)) body: UpdateCampaignInput,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Campaign> {
    return this.program.updateCampaign(tenant, campaignId, body, meta);
  }

  @Delete('campaigns/:campaignId')
  @RequirePermission(Permission.ManageProgram)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a campaign' })
  deleteCampaign(
    @CurrentTenant() tenant: TenantContext,
    @Param('campaignId', new ResourceIdPipe('Campaign')) campaignId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.program.deleteCampaign(tenant, campaignId, meta);
  }
}
