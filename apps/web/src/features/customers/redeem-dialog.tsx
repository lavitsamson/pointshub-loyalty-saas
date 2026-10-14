'use client';

import type { Customer, Redemption } from '@pointshub/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, LoadingRows } from '@/components/ui/feedback';
import { errorMessage } from '@/lib/api/client';
import { useRedeem, useRewards } from '@/lib/api/rewards';
import { formatNumber } from '@/lib/format';

/** Staff redeeming a reward on a customer's behalf at the counter. */
export function RedeemDialog({
  tenantId,
  customer,
  open,
  onOpenChange,
}: {
  tenantId: string;
  customer: Customer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rewards = useRewards(tenantId, { active: 'true' });
  const redeem = useRedeem(tenantId);
  const [done, setDone] = useState<Redemption | null>(null);

  const close = (next: boolean) => {
    if (!next) {
      setDone(null);
      redeem.reset();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title={done ? 'Reward redeemed' : 'Redeem a reward'}
        description={
          done ? undefined : `${customer.name} has ${formatNumber(customer.pointsBalance)} points.`
        }
      >
        {done ? (
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <p className="text-sm text-muted-foreground">Redemption code for {done.reward.name}</p>
            <p className="font-mono text-3xl font-semibold tracking-widest">{done.code}</p>
            <p className="text-sm text-muted-foreground">
              {formatNumber(done.pointsSpent)} points spent. Fulfil it from the Redemptions page
              when you hand it over.
            </p>
            <DialogFooter className="mt-2 w-full">
              <DialogClose asChild>
                <Button>Done</Button>
              </DialogClose>
            </DialogFooter>
          </div>
        ) : rewards.isPending ? (
          <LoadingRows rows={3} label="Loading rewards" />
        ) : rewards.isError ? (
          <ErrorState
            message={errorMessage(rewards.error)}
            onRetry={() => void rewards.refetch()}
          />
        ) : rewards.items.length === 0 ? (
          <EmptyState
            title="No active rewards"
            description="Create a reward on the Rewards page."
          />
        ) : (
          <>
            {redeem.error && <Alert variant="destructive">{errorMessage(redeem.error)}</Alert>}
            <ul className="flex flex-col divide-y rounded-md border">
              {rewards.items.map((reward) => {
                const outOfStock = reward.stock === 0;
                const short = reward.pointsCost > customer.pointsBalance;
                return (
                  <li key={reward.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{reward.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatNumber(reward.pointsCost)} points
                        {reward.stock !== null && ` · ${formatNumber(reward.stock)} left`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={outOfStock || short || redeem.isPending}
                      onClick={() =>
                        redeem.mutate(
                          { customerId: customer.id, rewardId: reward.id },
                          { onSuccess: setDone },
                        )
                      }
                    >
                      {outOfStock ? 'Out of stock' : short ? 'Not enough points' : 'Redeem'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
