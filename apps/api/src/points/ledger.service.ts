import { Injectable, NotFoundException } from '@nestjs/common';
import type { Customer, LedgerEntryType, PointsLedgerEntry, Tier } from '@pointshub/db';
import { tierFor } from '@pointshub/shared';
import { ProblemException } from '../common/http/problem.exception';
import { OutboxService } from '../outbox/outbox.service';
import type { ScopedTransaction } from '../tenancy/tenant-scope';

export type LockedCustomer = Customer & { currentTier: Tier | null };

export interface LedgerChange {
  type: LedgerEntryType;
  /** Signed: positive credits the customer, negative debits them. */
  points: number;
  reason?: string;
  purchaseId?: string;
  redemptionId?: string;
  expiresAt?: Date | null;
  createdByUserId?: string;
}

export interface LedgerResult {
  entry: PointsLedgerEntry;
  balance: number;
  tier: Tier | null;
  tierChanged: boolean;
}

/**
 * The only code that changes a customer's points. Every change follows the same steps
 * inside the caller's transaction:
 *
 *   1. lock the customer row (SELECT ... FOR UPDATE) so concurrent changes queue up,
 *   2. reject the change if it would make the balance negative,
 *   3. append a ledger entry carrying the resulting balance,
 *   4. update the cached balance, lifetime points and (after earning) the tier.
 *
 * Callers add the domain event for the movement; this service adds tier.changed.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly outbox: OutboxService) {}

  /**
   * Locks the customer for the rest of the transaction. Raw SQL is not covered by the
   * tenant-scoped client, so the tenant filter is explicit here.
   */
  async lockCustomer(
    tx: ScopedTransaction,
    tenantId: string,
    customerId: string,
  ): Promise<LockedCustomer> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Customer"
      WHERE id = ${customerId}::uuid AND "tenantId" = ${tenantId}::uuid
      FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundException('Customer not found');

    return tx.customer.findUniqueOrThrow({
      where: { id: customerId },
      include: { currentTier: true },
    });
  }

  /** Appends a movement for a customer locked earlier in the same transaction. */
  async append(
    tx: ScopedTransaction,
    customer: LockedCustomer,
    change: LedgerChange,
  ): Promise<LedgerResult> {
    const balance = customer.pointsBalance + change.points;
    if (balance < 0) {
      throw new ProblemException({
        type: '/problems/insufficient-points',
        title: 'Not enough points',
        status: 409,
        detail: `The customer has ${customer.pointsBalance} points; this needs ${-change.points}.`,
      });
    }

    const lifetimePoints =
      change.type === 'EARN' ? customer.lifetimePoints + change.points : customer.lifetimePoints;

    const previousTierId = customer.currentTierId;
    let tier = customer.currentTier;
    if (change.type === 'EARN') {
      const tiers = await tx.tier.findMany();
      tier = tierFor(tiers, lifetimePoints, customer.currentTier);
    }
    const tierChanged = (tier?.id ?? null) !== previousTierId;

    const entry = await tx.pointsLedgerEntry.create({
      data: {
        tenantId: customer.tenantId,
        customerId: customer.id,
        type: change.type,
        points: change.points,
        balanceAfter: balance,
        reason: change.reason ?? null,
        purchaseId: change.purchaseId ?? null,
        redemptionId: change.redemptionId ?? null,
        expiresAt: change.expiresAt ?? null,
        createdByUserId: change.createdByUserId ?? null,
      },
    });

    await tx.customer.update({
      where: { id: customer.id },
      data: { pointsBalance: balance, lifetimePoints, currentTierId: tier?.id ?? null },
    });

    // Keep the in-memory copy current so a caller can append several movements.
    customer.pointsBalance = balance;
    customer.lifetimePoints = lifetimePoints;
    customer.currentTier = tier;
    customer.currentTierId = tier?.id ?? null;

    if (tierChanged && tier) {
      await this.outbox.add(tx, customer.tenantId, 'tier.changed', {
        customerId: customer.id,
        fromTierId: previousTierId,
        toTierId: tier.id,
        toTierName: tier.name,
      });
    }

    return { entry, balance, tier, tierChanged };
  }
}
