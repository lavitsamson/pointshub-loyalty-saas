import type { LedgerEntryType } from '@pointshub/shared';
import { formatNumber } from '@/lib/format';

export const LEDGER_ENTRY_LABELS: Record<LedgerEntryType, string> = {
  EARN: 'Purchase',
  REDEEM: 'Redeemed',
  EXPIRE: 'Expired',
  ADJUST: 'Adjustment',
  REVERSAL: 'Refund',
};

interface TierThreshold {
  name: string;
  minLifetimePoints: number;
}

/** Progress from the current tier's threshold towards the next one (tiers never drop). */
export function TierProgress({ lifetime, tiers }: { lifetime: number; tiers: TierThreshold[] }) {
  const sorted = [...tiers].sort((a, b) => a.minLifetimePoints - b.minLifetimePoints);
  const next = sorted.find((t) => t.minLifetimePoints > lifetime);
  const current = sorted.filter((t) => t.minLifetimePoints <= lifetime).at(-1);

  if (!next) {
    return <p className="text-sm text-muted-foreground">Top tier reached.</p>;
  }
  const from = current?.minLifetimePoints ?? 0;
  const percent = Math.round(((lifetime - from) / (next.minLifetimePoints - from)) * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{current?.name ?? 'No tier'}</span>
        <span>
          {formatNumber(next.minLifetimePoints - lifetime)} to {next.name}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`Progress to ${next.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 rounded-full bg-muted"
      >
        <div className="h-2 rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
