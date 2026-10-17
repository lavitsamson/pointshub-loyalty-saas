'use client';

import { type Customer, Permission } from '@pointshub/shared';
import { ArrowLeft, Gift, Pencil, PlusCircle, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/app/page-header';
import { useTenant } from '@/components/app/tenant-context';
import { LEDGER_ENTRY_LABELS, TierProgress } from '@/components/loyalty/tier-progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingRows, Skeleton } from '@/components/ui/feedback';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage, isApiError } from '@/lib/api/client';
import { useCustomer, useLedger } from '@/lib/api/customers';
import { useTiers } from '@/lib/api/program';
import { formatDate, formatDateTime, formatNumber, formatPointsDelta } from '@/lib/format';
import { useDialogs } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { AdjustPointsDialog, EditCustomerDialog } from './customer-dialogs';
import { RedeemDialog } from './redeem-dialog';

export function CustomerDetailPage() {
  const tenant = useTenant();
  const { customerId } = useParams<{ customerId: string }>();
  const customer = useCustomer(tenant.tenantId, customerId);
  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
      <Link href={`/app/${tenant.tenantId}/customers`}>
        <ArrowLeft aria-hidden /> Customers
      </Link>
    </Button>
  );

  if (customer.isPending) {
    return (
      <div role="status" aria-label="Loading customer" className="flex flex-col gap-4">
        {back}
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40 md:col-span-2" />
        </div>
      </div>
    );
  }
  if (customer.isError) {
    return (
      <>
        {back}
        {isApiError(customer.error, 404) ? (
          <EmptyState title="Customer not found" />
        ) : (
          <ErrorState
            message={errorMessage(customer.error)}
            onRetry={() => void customer.refetch()}
          />
        )}
      </>
    );
  }
  return (
    <>
      {back}
      <CustomerDetail customer={customer.data} />
    </>
  );
}

function CustomerDetail({ customer }: { customer: Customer }) {
  const tenant = useTenant();
  const tiers = useTiers(tenant.tenantId);
  const dialogs = useDialogs<'edit' | 'adjust' | 'redeem'>();

  return (
    <>
      <PageHeader
        title={customer.name}
        description={`Customer since ${formatDate(customer.createdAt)}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/app/${tenant.tenantId}/record-purchase?customerId=${customer.id}`}>
                <ShoppingBag aria-hidden /> Record purchase
              </Link>
            </Button>
            {tenant.can(Permission.FulfilRedemption) && (
              <Button variant="outline" onClick={() => dialogs.show('redeem')}>
                <Gift aria-hidden /> Redeem reward
              </Button>
            )}
            {tenant.can(Permission.AdjustPoints) && (
              <Button onClick={() => dialogs.show('adjust')}>
                <PlusCircle aria-hidden /> Adjust points
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Points</CardTitle>
              {customer.tier && <Badge>{customer.tier.name}</Badge>}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <p className="text-4xl font-semibold tabular-nums">
                  {formatNumber(customer.pointsBalance)}
                </p>
                <p className="text-sm text-muted-foreground">
                  available · {formatNumber(customer.lifetimePoints)} earned in total
                </p>
              </div>
              {tiers.data && <TierProgress lifetime={customer.lifetimePoints} tiers={tiers.data} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Details</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => dialogs.show('edit')}>
                <Pencil aria-hidden /> Edit
              </Button>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="truncate">{customer.email}</dd>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{customer.phone ?? '—'}</dd>
                <dt className="text-muted-foreground">Tags</dt>
                <dd className="flex flex-wrap gap-1">
                  {customer.tags.length
                    ? customer.tags.map((t) => (
                        <Badge key={t} variant="outline">
                          {t}
                        </Badge>
                      ))
                    : '—'}
                </dd>
              </dl>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Points history</CardTitle>
          </CardHeader>
          <CardContent>
            <LedgerTable tenantId={tenant.tenantId} customerId={customer.id} />
          </CardContent>
        </Card>
      </div>

      <EditCustomerDialog
        tenantId={tenant.tenantId}
        customer={customer}
        {...dialogs.props('edit')}
      />
      <AdjustPointsDialog
        tenantId={tenant.tenantId}
        customer={customer}
        {...dialogs.props('adjust')}
      />
      <RedeemDialog tenantId={tenant.tenantId} customer={customer} {...dialogs.props('redeem')} />
    </>
  );
}

function LedgerTable({ tenantId, customerId }: { tenantId: string; customerId: string }) {
  const ledger = useLedger(tenantId, customerId);

  if (ledger.isPending) return <LoadingRows rows={6} label="Loading points history" />;
  if (ledger.isError) {
    return (
      <ErrorState message={errorMessage(ledger.error)} onRetry={() => void ledger.refetch()} />
    );
  }
  if (ledger.items.length === 0) {
    return <EmptyState title="No points activity yet" />;
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Activity</TableHead>
            <TableHead className="text-right">Points</TableHead>
            <TableHead className="text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ledger.items.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDateTime(entry.createdAt)}
              </TableCell>
              <TableCell>
                <span className="font-medium">{LEDGER_ENTRY_LABELS[entry.type]}</span>
                {entry.reason && (
                  <span className="block text-xs text-muted-foreground">{entry.reason}</span>
                )}
                {entry.expiresAt && (
                  <span className="block text-xs text-muted-foreground">
                    Expires {formatDate(entry.expiresAt)}
                  </span>
                )}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right font-medium tabular-nums',
                  entry.points > 0 ? 'text-success' : 'text-destructive',
                )}
              >
                {formatPointsDelta(entry.points)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(entry.balanceAfter)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {ledger.hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={ledger.isFetchingNextPage}
            onClick={() => void ledger.fetchNextPage()}
          >
            {ledger.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </>
  );
}
