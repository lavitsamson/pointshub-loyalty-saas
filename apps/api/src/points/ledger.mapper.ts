import type { PointsLedgerEntry } from '@pointshub/db';
import type { LedgerEntry } from '@pointshub/shared';

export function toLedgerEntry(entry: PointsLedgerEntry): LedgerEntry {
  return {
    id: entry.id,
    type: entry.type,
    points: entry.points,
    balanceAfter: entry.balanceAfter,
    reason: entry.reason,
    purchaseId: entry.purchaseId,
    redemptionId: entry.redemptionId,
    expiresAt: entry.expiresAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
  };
}
