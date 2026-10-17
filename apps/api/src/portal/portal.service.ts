import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type {
  LedgerEntry,
  Paginated,
  PaginationQuery,
  PortalBusiness,
  PortalMe,
  PortalRedemption,
  Redemption,
  Reward,
} from '@pointshub/shared';
import { CustomersService } from '../customers/customers.service';
import { PrismaService } from '../infra/prisma.service';
import { RedemptionsService } from '../rewards/redemptions.service';
import { RewardsService } from '../rewards/rewards.service';
import type { PortalContext } from './portal-context';

/**
 * What a signed-in customer can see and do. Each call delegates to the same tenant-scoped
 * services the dashboard uses, always for the customer's own id, which only ever comes from
 * their session.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly rewards: RewardsService,
    private readonly redemptionsService: RedemptionsService,
  ) {}

  async business(portal: PortalContext): Promise<PortalBusiness> {
    const program = await this.prisma.scoped.loyaltyProgram.findUnique({
      where: { tenantId: portal.tenantId },
    });
    if (!program) throw new NotFoundException('Business not found');
    return {
      name: portal.tenantName,
      slug: portal.tenantSlug,
      currency: program.currency,
      pointsPerCurrencyUnit: program.pointsPerCurrencyUnit.toString(),
    };
  }

  async me(portal: PortalContext, customerId: string): Promise<PortalMe> {
    const [customer, tiers] = await Promise.all([
      this.prisma.scoped.customer.findUnique({
        where: { id: customerId },
        include: { currentTier: true },
      }),
      this.prisma.scoped.tier.findMany({ orderBy: { minLifetimePoints: 'asc' } }),
    ]);
    // A valid token for a customer that no longer exists is not a session.
    if (!customer) throw new UnauthorizedException('Not signed in');

    const tier = (t: { id: string; name: string; minLifetimePoints: number }) => ({
      id: t.id,
      name: t.name,
      minLifetimePoints: t.minLifetimePoints,
    });
    return {
      customer: { id: customer.id, name: customer.name, email: customer.email },
      business: { name: portal.tenantName, slug: portal.tenantSlug },
      pointsBalance: customer.pointsBalance,
      lifetimePoints: customer.lifetimePoints,
      tier: customer.currentTier && tier(customer.currentTier),
      tiers: tiers.map(tier),
    };
  }

  ledger(customerId: string, query: PaginationQuery): Promise<Paginated<LedgerEntry>> {
    return this.customers.ledger(customerId, query);
  }

  /** The catalogue: active rewards only. */
  catalogue(query: PaginationQuery): Promise<Paginated<Reward>> {
    return this.rewards.list({ ...query, active: true });
  }

  async redemptions(
    customerId: string,
    query: PaginationQuery,
  ): Promise<Paginated<PortalRedemption>> {
    const page = await this.redemptionsService.list({ ...query, customerId });
    return { ...page, data: page.data.map(toPortalRedemption) };
  }

  async redeem(
    portal: PortalContext,
    customerId: string,
    rewardId: string,
  ): Promise<PortalRedemption> {
    const redemption = await this.redemptionsService.create(
      { tenantId: portal.tenantId },
      { customerId, rewardId },
    );
    return toPortalRedemption(redemption);
  }
}

/** Explicit fields, so nothing added to the staff view later leaks into the portal. */
function toPortalRedemption(r: Redemption): PortalRedemption {
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    pointsSpent: r.pointsSpent,
    reward: r.reward,
    fulfilledAt: r.fulfilledAt,
    cancelledAt: r.cancelledAt,
    createdAt: r.createdAt,
  };
}
