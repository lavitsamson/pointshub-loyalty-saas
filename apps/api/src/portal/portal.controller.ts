import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type LedgerEntry,
  type Paginated,
  PaginationQuerySchema,
  type PaginationQuery,
  type PortalMe,
  PortalRedeemSchema,
  type PortalRedeemInput,
  type PortalRedemption,
  type Reward,
} from '@pointshub/shared';
import { Public } from '../auth/decorators';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import { CurrentCustomerId, Portal, type PortalContext } from './portal-context';
import { CustomerSessionGuard, PortalTenantGuard } from './portal.guards';
import { PortalService } from './portal.service';

/** The signed-in customer's own account. Merchant sessions do not apply here. */
@ApiTags('portal')
@Public()
@UseGuards(PortalTenantGuard, CustomerSessionGuard)
@Controller('portal/:tenantSlug')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('me')
  @ApiOperation({ summary: 'Balance, tier and progress to the next tier' })
  me(@Portal() portal: PortalContext, @CurrentCustomerId() customerId: string): Promise<PortalMe> {
    return this.portal.me(portal, customerId);
  }

  @Get('me/ledger')
  @ApiOperation({ summary: 'Points history, newest first' })
  ledger(
    @CurrentCustomerId() customerId: string,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
  ): Promise<Paginated<LedgerEntry>> {
    return this.portal.ledger(customerId, query);
  }

  @Get('me/redemptions')
  @ApiOperation({ summary: 'Redemption history with codes, newest first' })
  redemptions(
    @CurrentCustomerId() customerId: string,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
  ): Promise<Paginated<PortalRedemption>> {
    return this.portal.redemptions(customerId, query);
  }

  @Get('rewards')
  @ApiOperation({ summary: 'The reward catalogue (active rewards)' })
  rewards(
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
  ): Promise<Paginated<Reward>> {
    return this.portal.catalogue(query);
  }

  @Post('redemptions')
  @ApiOperation({ summary: 'Redeem a reward; returns the code to show at the counter' })
  redeem(
    @Portal() portal: PortalContext,
    @CurrentCustomerId() customerId: string,
    @Body(new ZodValidationPipe(PortalRedeemSchema)) body: PortalRedeemInput,
  ): Promise<PortalRedemption> {
    return this.portal.redeem(portal, customerId, body.rewardId);
  }
}
