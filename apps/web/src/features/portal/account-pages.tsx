'use client';

import type { LedgerEntry, PortalRedemption, RedemptionStatus, Reward } from '@pointshub/shared';
import { Gift } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { LEDGER_ENTRY_LABELS, TierProgress } from '@/components/loyalty/tier-progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, LoadingRows } from '@/components/ui/feedback';
import { errorMessage } from '@/lib/api/client';
import {
  usePortalLedger,
  usePortalRedeem,
  usePortalRedemptions,
  usePortalRewards,
} from '@/lib/api/portal';
import { formatDate, formatDateTime, formatNumber, formatPointsDelta } from '@/lib/format';
import { cn } from '@/lib/utils';
import { portalHref, usePortalAccount, usePortalSlug } from './portal-shell';

/** The shared shape of every infinite list hook, for the "Load more" footer. */
interface MoreList {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
}

function LoadMore({ list }: { list: MoreList }) {
  if (!list.hasNextPage) return null;
  return (
    <div className="mt-3 flex justify-center">
      <Button
        variant="outline"
        size="sm"
        disabled={list.isFetchingNextPage}
        onClick={() => void list.fetchNextPage()}
      >
        {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export function PortalHomePage() {
  const me = usePortalAccount();
  const slug = usePortalSlug();
  const firstName = me.customer.name.split(' ')[0] ?? me.customer.name;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Hi, {firstName}</h1>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Your points</CardTitle>
          {me.tier && <Badge>{me.tier.name}</Badge>}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <p className="text-5xl font-semibold tabular-nums">{formatNumber(me.pointsBalance)}</p>
            <p className="text-sm text-muted-foreground">
              to spend · {formatNumber(me.lifetimePoints)} earned in total
            </p>
          </div>
          {me.tiers.length > 0 && <TierProgress lifetime={me.lifetimePoints} tiers={me.tiers} />}
          <Button asChild>
            <Link href={portalHref(slug, 'rewards')}>
              <Gift aria-hidden /> Browse rewards
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent activity</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href={portalHref(slug, 'activity')}>See all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <LedgerList limit={5} />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export function PortalActivityPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
      <LedgerList />
    </div>
  );
}

function LedgerList({ limit }: { limit?: number }) {
  const slug = usePortalSlug();
  const ledger = usePortalLedger(slug);

  if (ledger.isPending) return <LoadingRows rows={limit ?? 6} label="Loading your activity" />;
  if (ledger.isError) {
    return (
      <ErrorState message={errorMessage(ledger.error)} onRetry={() => void ledger.refetch()} />
    );
  }
  if (ledger.items.length === 0) {
    return (
      <EmptyState
        title="No points yet"
        description="Points appear here after your first purchase."
      />
    );
  }
  const entries = limit ? ledger.items.slice(0, limit) : ledger.items;
  return (
    <>
      <ul className="flex flex-col divide-y">
        {entries.map((entry) => (
          <LedgerRow key={entry.id} entry={entry} />
        ))}
      </ul>
      {!limit && <LoadMore list={ledger} />}
    </>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-medium">{LEDGER_ENTRY_LABELS[entry.type]}</p>
        <p className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</p>
        {entry.reason && <p className="text-xs text-muted-foreground">{entry.reason}</p>}
        {entry.expiresAt && (
          <p className="text-xs text-muted-foreground">Expires {formatDate(entry.expiresAt)}</p>
        )}
      </div>
      <div className="text-right">
        <p
          className={cn(
            'font-medium tabular-nums',
            entry.points > 0 ? 'text-success' : 'text-destructive',
          )}
        >
          {formatPointsDelta(entry.points)}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatNumber(entry.balanceAfter)} total
        </p>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export function PortalRewardsPage() {
  const me = usePortalAccount();
  const slug = usePortalSlug();
  const rewards = usePortalRewards(slug);
  const [chosen, setChosen] = useState<Reward | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rewards</h1>
        <p className="text-sm text-muted-foreground">
          You have {formatNumber(me.pointsBalance)} points to spend.
        </p>
      </div>

      {rewards.isPending ? (
        <LoadingRows rows={4} label="Loading rewards" />
      ) : rewards.isError ? (
        <ErrorState message={errorMessage(rewards.error)} onRetry={() => void rewards.refetch()} />
      ) : rewards.items.length === 0 ? (
        <EmptyState title="No rewards yet" description="Check back soon." />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {rewards.items.map((reward) => {
              const outOfStock = reward.stock === 0;
              const shortBy = reward.pointsCost - me.pointsBalance;
              return (
                <li key={reward.id}>
                  <Card>
                    <CardContent className="flex items-center justify-between gap-3 pt-5">
                      <div className="min-w-0">
                        <h2 className="font-semibold">{reward.name}</h2>
                        {reward.description && (
                          <p className="text-sm text-muted-foreground">{reward.description}</p>
                        )}
                        <p className="mt-1 text-sm font-medium tabular-nums">
                          {formatNumber(reward.pointsCost)} points
                          {reward.stock !== null && reward.stock > 0 && (
                            <span className="font-normal text-muted-foreground">
                              {' '}
                              · {formatNumber(reward.stock)} left
                            </span>
                          )}
                        </p>
                      </div>
                      <Button
                        className="shrink-0"
                        variant={shortBy > 0 || outOfStock ? 'outline' : 'default'}
                        disabled={outOfStock || shortBy > 0}
                        onClick={() => setChosen(reward)}
                      >
                        {outOfStock
                          ? 'Out of stock'
                          : shortBy > 0
                            ? `${formatNumber(shortBy)} more points needed`
                            : 'Redeem'}
                        <span className="sr-only"> for {reward.name}</span>
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
          <LoadMore list={rewards} />
        </>
      )}

      <RedeemDialog reward={chosen} onClose={() => setChosen(null)} />
    </div>
  );
}

/** Confirm, then show the code to read out at the counter. Points are never spent optimistically. */
function RedeemDialog({ reward, onClose }: { reward: Reward | null; onClose: () => void }) {
  const slug = usePortalSlug();
  const redeem = usePortalRedeem(slug);
  const done = redeem.data;

  const close = (open: boolean) => {
    if (open) return;
    redeem.reset();
    onClose();
  };

  return (
    <Dialog open={reward !== null} onOpenChange={close}>
      {reward && (
        <DialogContent
          title={done ? 'Your reward code' : `Redeem ${reward.name}?`}
          description={
            done
              ? undefined
              : `This spends ${formatNumber(reward.pointsCost)} points. You will get a code to show at the counter.`
          }
        >
          {done ? (
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <p className="text-sm text-muted-foreground">
                Show this code to claim {done.reward.name}
              </p>
              <p className="font-mono text-4xl font-semibold tracking-widest">{done.code}</p>
              <p className="text-sm text-muted-foreground">You can find it again under My codes.</p>
              <DialogFooter className="mt-2 w-full">
                <DialogClose asChild>
                  <Button>Done</Button>
                </DialogClose>
              </DialogFooter>
            </div>
          ) : (
            <>
              {redeem.error && <Alert variant="destructive">{errorMessage(redeem.error)}</Alert>}
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Not now</Button>
                </DialogClose>
                <Button disabled={redeem.isPending} onClick={() => redeem.mutate(reward.id)}>
                  {redeem.isPending ? 'Redeeming…' : 'Redeem'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Redemptions
// ---------------------------------------------------------------------------

const STATUS: Record<
  RedemptionStatus,
  { label: string; variant: 'default' | 'success' | 'muted' }
> = {
  PENDING: { label: 'Ready to claim', variant: 'default' },
  FULFILLED: { label: 'Claimed', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'muted' },
};

export function PortalRedemptionsPage() {
  const slug = usePortalSlug();
  const redemptions = usePortalRedemptions(slug);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">My codes</h1>
      {redemptions.isPending ? (
        <LoadingRows rows={4} label="Loading your codes" />
      ) : redemptions.isError ? (
        <ErrorState
          message={errorMessage(redemptions.error)}
          onRetry={() => void redemptions.refetch()}
        />
      ) : redemptions.items.length === 0 ? (
        <EmptyState
          title="No rewards redeemed yet"
          action={
            <Button asChild variant="outline">
              <Link href={portalHref(slug, 'rewards')}>Browse rewards</Link>
            </Button>
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {redemptions.items.map((r) => (
              <RedemptionCard key={r.id} redemption={r} />
            ))}
          </ul>
          <LoadMore list={redemptions} />
        </>
      )}
    </div>
  );
}

function RedemptionCard({ redemption: r }: { redemption: PortalRedemption }) {
  const status = STATUS[r.status];
  const settledAt = r.fulfilledAt ?? r.cancelledAt;
  return (
    <li>
      <Card>
        <CardContent className="flex items-center justify-between gap-3 pt-5">
          <div className="min-w-0">
            <h2 className="font-semibold">{r.reward.name}</h2>
            <p className="text-xs text-muted-foreground">
              {formatNumber(r.pointsSpent)} points · {formatDate(r.createdAt)}
              {settledAt && ` · ${status.label.toLowerCase()} ${formatDate(settledAt)}`}
            </p>
            <Badge variant={status.variant} className="mt-2">
              {status.label}
            </Badge>
          </div>
          <p
            className={cn(
              'shrink-0 font-mono font-semibold tracking-widest',
              r.status === 'PENDING' ? 'text-2xl' : 'text-sm text-muted-foreground line-through',
            )}
          >
            {r.code}
          </p>
        </CardContent>
      </Card>
    </li>
  );
}
