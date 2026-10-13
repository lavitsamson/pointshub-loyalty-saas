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
  CreateRedemptionSchema,
  type CreateRedemptionInput,
  CreateRewardSchema,
  type CreateRewardInput,
  type Paginated,
  type Redemption,
  RedemptionListQuerySchema,
  type RedemptionListQuery,
  type Reward,
  RewardListQuerySchema,
  type RewardListQuery,
  UpdateRewardSchema,
  type UpdateRewardInput,
} from '@pointshub/shared';
import { ReqMeta, type RequestMeta } from '../auth/decorators';
import { ResourceIdPipe } from '../common/http/resource-id.pipe';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import { CurrentTenant, RequirePermission } from '../tenancy/decorators';
import { Permission } from '../tenancy/permissions';
import type { TenantContext } from '../tenancy/tenant-context';
import { RedemptionsService } from './redemptions.service';
import { RewardsService } from './rewards.service';

const RewardId = new ResourceIdPipe('Reward');
const RedemptionId = new ResourceIdPipe('Redemption');

@ApiTags('rewards')
@Controller('tenants/:tenantId')
export class RewardsController {
  constructor(
    private readonly rewards: RewardsService,
    private readonly redemptions: RedemptionsService,
  ) {}

  @Get('rewards')
  @ApiOperation({ summary: 'Reward catalogue' })
  list(
    @Query(new ZodValidationPipe(RewardListQuerySchema)) query: RewardListQuery,
  ): Promise<Paginated<Reward>> {
    return this.rewards.list(query);
  }

  @Get('rewards/:rewardId')
  @ApiOperation({ summary: 'One reward' })
  get(@Param('rewardId', RewardId) rewardId: string): Promise<Reward> {
    return this.rewards.get(rewardId);
  }

  @Post('rewards')
  @RequirePermission(Permission.ManageProgram)
  @ApiOperation({ summary: 'Add a reward' })
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(CreateRewardSchema)) body: CreateRewardInput,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Reward> {
    return this.rewards.create(tenant, body, meta);
  }

  @Patch('rewards/:rewardId')
  @RequirePermission(Permission.ManageProgram)
  @ApiOperation({ summary: 'Edit, restock or deactivate a reward' })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('rewardId', RewardId) rewardId: string,
    @Body(new ZodValidationPipe(UpdateRewardSchema)) body: UpdateRewardInput,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Reward> {
    return this.rewards.update(tenant, rewardId, body, meta);
  }

  @Delete('rewards/:rewardId')
  @RequirePermission(Permission.ManageProgram)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a reward that was never redeemed' })
  remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('rewardId', RewardId) rewardId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.rewards.remove(tenant, rewardId, meta);
  }

  @Post('redemptions')
  @RequirePermission(Permission.FulfilRedemption)
  @ApiOperation({ summary: 'Redeem a reward for a customer; returns the counter code' })
  redeem(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(CreateRedemptionSchema)) body: CreateRedemptionInput,
  ): Promise<Redemption> {
    return this.redemptions.create(tenant, body);
  }

  @Get('redemptions')
  @RequirePermission(Permission.FulfilRedemption)
  @ApiOperation({ summary: 'Redemptions, filterable by status, code or customer' })
  listRedemptions(
    @Query(new ZodValidationPipe(RedemptionListQuerySchema)) query: RedemptionListQuery,
  ): Promise<Paginated<Redemption>> {
    return this.redemptions.list(query);
  }

  @Post('redemptions/:redemptionId/fulfil')
  @RequirePermission(Permission.FulfilRedemption)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hand over the reward' })
  fulfil(
    @CurrentTenant() tenant: TenantContext,
    @Param('redemptionId', RedemptionId) redemptionId: string,
  ): Promise<Redemption> {
    return this.redemptions.fulfil(tenant, redemptionId);
  }

  @Post('redemptions/:redemptionId/cancel')
  @RequirePermission(Permission.AdjustPoints)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending redemption and refund the points' })
  cancel(
    @CurrentTenant() tenant: TenantContext,
    @Param('redemptionId', RedemptionId) redemptionId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Redemption> {
    return this.redemptions.cancel(tenant, redemptionId, meta);
  }
}
