import { Injectable } from '@nestjs/common';
import type { Purchase } from '@pointshub/db';
import {
  addMonths,
  calculatePointsEarned,
  type PurchaseResult,
  type RecordPurchaseInput,
} from '@pointshub/shared';
import { ProblemException } from '../common/http/problem.exception';
import { isUniqueViolation } from '../common/prisma-errors';
import { PrismaService } from '../infra/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { LedgerService } from './ledger.service';

const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{8,255}$/;

export interface RecordedPurchase {
  result: PurchaseResult;
  /** True when this request repeated an earlier one with the same Idempotency-Key. */
  replayed: boolean;
}

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Records a purchase and awards points, exactly once per Idempotency-Key. A retry with
   * the same key (a double-tap, a network retry) returns the original outcome instead of
   * awarding points twice; the same key with a different purchase is rejected.
   */
  async record(
    ctx: TenantContext,
    input: RecordPurchaseInput,
    idempotencyKey: string | undefined,
  ): Promise<RecordedPurchase> {
    if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new ProblemException({
        type: '/problems/idempotency-key-required',
        title: 'Idempotency-Key header required',
        status: 400,
        detail: 'Send a unique Idempotency-Key header (8–255 printable characters) per purchase.',
      });
    }

    const previous = await this.replay(input, idempotencyKey);
    if (previous) return previous;

    try {
      return { result: await this.create(ctx, input, idempotencyKey), replayed: false };
    } catch (error) {
      // Two requests with the same key raced; the loser replays the winner's result.
      if (isUniqueViolation(error)) {
        const winner = await this.replay(input, idempotencyKey);
        if (winner) return winner;
      }
      throw error;
    }
  }

  private async create(
    ctx: TenantContext,
    input: RecordPurchaseInput,
    idempotencyKey: string,
  ): Promise<PurchaseResult> {
    return this.prisma.scoped.$transaction(async (tx) => {
      const customer = await this.ledger.lockCustomer(tx, ctx.tenantId, input.customerId);
      const program = await tx.loyaltyProgram.findFirstOrThrow();
      const now = new Date();
      const campaigns = await tx.campaign.findMany({
        where: { active: true, startsAt: { lte: now }, endsAt: { gt: now } },
        select: { multiplier: true },
      });

      const points = calculatePointsEarned({
        amount: input.amount,
        pointsPerCurrencyUnit: program.pointsPerCurrencyUnit.toString(),
        tierMultiplier: customer.currentTier?.multiplier.toString() ?? '1',
        campaignMultipliers: campaigns.map((c) => c.multiplier.toString()),
      });

      const purchase = await tx.purchase.create({
        data: {
          tenantId: ctx.tenantId,
          customerId: customer.id,
          amount: input.amount,
          currency: program.currency,
          recordedByUserId: ctx.userId,
          externalRef: input.externalRef ?? null,
          idempotencyKey,
        },
      });

      const { entry, balance, tier, tierChanged } = await this.ledger.append(tx, customer, {
        type: 'EARN',
        points,
        purchaseId: purchase.id,
        expiresAt: program.pointsExpiryMonths ? addMonths(now, program.pointsExpiryMonths) : null,
        createdByUserId: ctx.userId,
      });

      await this.outbox.add(tx, ctx.tenantId, 'points.earned', {
        customerId: customer.id,
        ledgerEntryId: entry.id,
        points,
        balanceAfter: balance,
        purchaseId: purchase.id,
        amount: purchase.amount.toFixed(2),
      });

      return {
        purchase: toPurchase(purchase),
        pointsEarned: points,
        balance,
        tier: tier && { id: tier.id, name: tier.name },
        tierChanged,
      };
    });
  }

  /** The outcome of an earlier request with this key, or null if there was none. */
  private async replay(
    input: RecordPurchaseInput,
    idempotencyKey: string,
  ): Promise<RecordedPurchase | null> {
    const purchase = await this.prisma.scoped.purchase.findFirst({
      where: { idempotencyKey },
      include: {
        ledgerEntries: { where: { type: 'EARN' }, take: 1 },
        customer: { include: { currentTier: true } },
      },
    });
    if (!purchase) return null;

    const sameRequest =
      purchase.customerId === input.customerId &&
      purchase.amount.equals(input.amount) &&
      (purchase.externalRef ?? undefined) === input.externalRef;
    if (!sameRequest) {
      throw new ProblemException({
        type: '/problems/idempotency-key-reused',
        title: 'Idempotency-Key already used',
        status: 422,
        detail: 'This key was used for a different purchase. Generate a new key per purchase.',
      });
    }

    const earn = purchase.ledgerEntries[0];
    const tier = purchase.customer.currentTier;
    return {
      replayed: true,
      result: {
        purchase: toPurchase(purchase),
        pointsEarned: earn?.points ?? 0,
        balance: earn?.balanceAfter ?? purchase.customer.pointsBalance,
        tier: tier && { id: tier.id, name: tier.name },
        // The original response reported any tier change; a replay must not announce it again.
        tierChanged: false,
      },
    };
  }
}

function toPurchase(purchase: Purchase): PurchaseResult['purchase'] {
  return {
    id: purchase.id,
    customerId: purchase.customerId,
    amount: purchase.amount.toFixed(2),
    currency: purchase.currency,
    externalRef: purchase.externalRef,
    createdAt: purchase.createdAt.toISOString(),
  };
}
