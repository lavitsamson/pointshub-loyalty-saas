import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AnalyticsSummary,
  type DailyStatsResponse,
  DateRangeQuerySchema,
  type DateRangeQuery,
  Permission,
  resolveDateRange,
  TopRewardsQuerySchema,
  type TopRewardsQuery,
  type TopRewardsResponse,
} from '@pointshub/shared';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import { RequirePermission } from '../tenancy/decorators';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@Controller('tenants/:tenantId/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  @RequirePermission(Permission.ViewCustomers)
  @ApiOperation({ summary: 'Headline figures for a date range (default: last 30 days)' })
  summary(
    @Query(new ZodValidationPipe(DateRangeQuerySchema)) query: DateRangeQuery,
  ): Promise<AnalyticsSummary> {
    return this.analytics.summary(resolveDateRange(query));
  }

  @Get('daily')
  @RequirePermission(Permission.ViewCustomers)
  @ApiOperation({ summary: 'One row per day, zero-filled, oldest first' })
  daily(
    @Query(new ZodValidationPipe(DateRangeQuerySchema)) query: DateRangeQuery,
  ): Promise<DailyStatsResponse> {
    return this.analytics.daily(resolveDateRange(query));
  }

  @Get('top-rewards')
  @RequirePermission(Permission.ViewCustomers)
  @ApiOperation({ summary: 'Most redeemed rewards in a date range' })
  topRewards(
    @Query(new ZodValidationPipe(TopRewardsQuerySchema)) query: TopRewardsQuery,
  ): Promise<TopRewardsResponse> {
    return this.analytics.topRewards(resolveDateRange(query), query.limit);
  }
}
