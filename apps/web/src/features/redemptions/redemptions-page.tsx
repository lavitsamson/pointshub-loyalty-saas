'use client';

import { Permission, type Redemption, type RedemptionStatus } from '@pointshub/shared';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { PageHeader } from '@/components/app/page-header';
import { useTenant } from '@/components/app/tenant-context';
import { ConfirmButton } from '@/components/confirm-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, LoadingRows } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/api/client';
import {
  useCancelRedemption,
  useFulfilRedemption,
  useRedemptionByCode,
  useRedemptions,
} from '@/lib/api/rewards';
import { formatDateTime, formatNumber } from '@/lib/format';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

const STATUS_BADGE: Record<RedemptionStatus, 'default' | 'success' | 'muted'> = {
  PENDING: 'default',
  FULFILLED: 'success',
  CANCELLED: 'muted',
};

const FILTERS: Array<{ value: RedemptionStatus | undefined; label: string }> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'FULFILLED', label: 'Fulfilled' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: undefined, label: 'All' },
];

export function RedemptionsPage() {
  const tenant = useTenant();
  const [status, setStatus] = useState<RedemptionStatus | undefined>('PENDING');
  const list = useRedemptions(tenant.tenantId, status ? { status } : {});

  return (
    <>
      <PageHeader title="Redemptions" description="Hand over rewards and keep track of codes." />
      <div className="flex flex-col gap-6">
        <FulfilByCode tenantId={tenant.tenantId} />

        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>History</CardTitle>
            <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <Button
                  key={f.label}
                  size="sm"
                  variant={status === f.value ? 'secondary' : 'ghost'}
                  aria-pressed={status === f.value}
                  onClick={() => setStatus(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {list.isPending ? (
              <LoadingRows rows={5} label="Loading redemptions" />
            ) : list.isError ? (
              <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
            ) : list.items.length === 0 ? (
              <EmptyState
                title={status ? `No ${status.toLowerCase()} redemptions` : 'No redemptions yet'}
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Reward</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Points</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">Created</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.items.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono font-medium">{r.code}</TableCell>
                        <TableCell>{r.reward.name}</TableCell>
                        <TableCell>
                          <Link
                            href={`/app/${tenant.tenantId}/customers/${r.customer.id}`}
                            className="hover:underline"
                          >
                            {r.customer.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(r.pointsSpent)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[r.status]} className="capitalize">
                            {r.status.toLowerCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                          {formatDateTime(r.createdAt)}
                        </TableCell>
                        <TableCell>
                          {r.status === 'PENDING' && (
                            <RedemptionActions tenantId={tenant.tenantId} redemption={r} compact />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {list.hasNextPage && (
                  <div className="mt-3 flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={list.isFetchingNextPage}
                      onClick={() => void list.fetchNextPage()}
                    >
                      Load more
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/** The counter flow: the customer reads out a code, staff look it up and hand over the reward. */
function FulfilByCode({ tenantId }: { tenantId: string }) {
  const [input, setInput] = useState('');
  const [code, setCode] = useState('');
  const lookup = useRedemptionByCode(tenantId, code);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setCode(input.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fulfil by code</CardTitle>
        <CardDescription>
          Ask the customer for the code shown in their portal, e.g. K7Q-4MP.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={submit} className="flex gap-2">
          <Input
            aria-label="Redemption code"
            placeholder="Code"
            autoComplete="off"
            autoCapitalize="characters"
            className="max-w-48 font-mono uppercase"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!input.trim()}>
            <Search aria-hidden /> Find
          </Button>
        </form>

        <div role="region" aria-label="Code lookup result" aria-live="polite">
          {code && lookup.isPending && <LoadingRows rows={1} label="Looking up code" />}
          {lookup.isError && <Alert variant="destructive">{errorMessage(lookup.error)}</Alert>}
          {lookup.isSuccess && lookup.data === null && (
            <Alert variant="destructive">No redemption has the code {code.toUpperCase()}.</Alert>
          )}
          {lookup.data && <RedemptionMatch tenantId={tenantId} redemption={lookup.data} />}
        </div>
      </CardContent>
    </Card>
  );
}

function RedemptionMatch({ tenantId, redemption }: { tenantId: string; redemption: Redemption }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">
          {redemption.reward.name}{' '}
          <Badge variant={STATUS_BADGE[redemption.status]} className="ml-1 capitalize">
            {redemption.status.toLowerCase()}
          </Badge>
        </p>
        <p className="text-sm text-muted-foreground">
          {redemption.customer.name} · <span className="font-mono">{redemption.code}</span> ·{' '}
          {formatNumber(redemption.pointsSpent)} points
        </p>
        {redemption.fulfilledAt && (
          <p className="text-sm text-muted-foreground">
            Handed over {formatDateTime(redemption.fulfilledAt)}
          </p>
        )}
      </div>
      {redemption.status === 'PENDING' && (
        <RedemptionActions tenantId={tenantId} redemption={redemption} />
      )}
    </div>
  );
}

function RedemptionActions({
  tenantId,
  redemption,
  compact = false,
}: {
  tenantId: string;
  redemption: Redemption;
  compact?: boolean;
}) {
  const tenant = useTenant();
  const fulfil = useFulfilRedemption(tenantId);
  const cancel = useCancelRedemption(tenantId);
  const size = compact ? 'sm' : 'default';

  return (
    <div className={cn('flex gap-2', compact && 'justify-end')}>
      {tenant.can(Permission.AdjustPoints) && (
        <ConfirmButton
          variant="ghost"
          size={size}
          title={`Cancel ${redemption.code}?`}
          description={`${formatNumber(redemption.pointsSpent)} points go back to ${redemption.customer.name}.`}
          confirmLabel="Cancel redemption"
          pending={cancel.isPending}
          onConfirm={() =>
            void notify(cancel.mutateAsync(redemption.id), {
              success: () => ({ title: 'Redemption cancelled', description: 'Points refunded.' }),
              failure: 'Could not cancel',
            })
          }
        >
          Cancel
        </ConfirmButton>
      )}
      <Button
        size={size}
        disabled={fulfil.isPending}
        onClick={() =>
          void notify(fulfil.mutateAsync(redemption.id), {
            success: (r) => ({
              title: `${r.reward.name} handed over`,
              description: r.code,
              variant: 'success',
            }),
            failure: 'Could not fulfil',
          })
        }
      >
        {fulfil.isPending ? 'Fulfilling…' : 'Fulfil'}
      </Button>
    </div>
  );
}
