'use client';

import { Permission } from '@pointshub/shared';
import { Gift, ShoppingBag, TrendingDown, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/app/page-header';
import { useTenant } from '@/components/app/tenant-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { useDailyStats, useSummary, useTopRewards } from '@/lib/api/analytics';
import { errorMessage } from '@/lib/api/client';
import { formatNumber } from '@/lib/format';
import { PointsChart } from './points-chart';

function Kpi({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: number | undefined;
  detail?: ReactNode;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-5">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          {label}
          <span aria-hidden className="[&_svg]:size-4">
            {icon}
          </span>
        </div>
        {value === undefined ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className="text-3xl font-semibold tabular-nums">{formatNumber(value)}</p>
        )}
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const tenant = useTenant();
  const summary = useSummary(tenant.tenantId);
  const daily = useDailyStats(tenant.tenantId);
  const topRewards = useTopRewards(tenant.tenantId);
  const s = summary.data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="The last 30 days at a glance."
        actions={
          tenant.can(Permission.RecordPurchase) && (
            <Button asChild>
              <Link href={`/app/${tenant.tenantId}/record-purchase`}>
                <ShoppingBag aria-hidden /> Record purchase
              </Link>
            </Button>
          )
        }
      />

      {summary.isError ? (
        <ErrorState message={errorMessage(summary.error)} onRetry={() => void summary.refetch()} />
      ) : (
        <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Customers"
            value={s?.totalCustomers}
            detail={s && `+${formatNumber(s.newCustomers)} in the last 30 days`}
            icon={<Users />}
          />
          <Kpi
            label="Points issued"
            value={s?.pointsEarned}
            detail={s && `${formatNumber(s.purchases)} purchases`}
            icon={<TrendingUp />}
          />
          <Kpi label="Points redeemed" value={s?.pointsRedeemed} icon={<TrendingDown />} />
          <Kpi label="Active rewards" value={s?.activeRewards} icon={<Gift />} />
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Points per day</CardTitle>
            <CardDescription>Earned from purchases and redeemed for rewards.</CardDescription>
          </CardHeader>
          <CardContent>
            {daily.isPending ? (
              <Skeleton className="h-72 w-full" />
            ) : daily.isError ? (
              <ErrorState
                message={errorMessage(daily.error)}
                onRetry={() => void daily.refetch()}
              />
            ) : daily.data.data.every((d) => d.pointsEarned === 0 && d.pointsRedeemed === 0) ? (
              <EmptyState
                title="No points activity yet"
                description="Daily figures appear here once purchases are recorded."
              />
            ) : (
              <PointsChart data={daily.data.data} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top rewards</CardTitle>
            <CardDescription>Most redeemed in the last 30 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {topRewards.isPending ? (
              <div className="flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : topRewards.isError ? (
              <ErrorState
                message={errorMessage(topRewards.error)}
                onRetry={() => void topRewards.refetch()}
              />
            ) : topRewards.data.data.length === 0 ? (
              <EmptyState title="No redemptions yet" />
            ) : (
              <ol className="flex flex-col gap-3">
                {topRewards.data.data.map((reward, i) => {
                  const max = topRewards.data.data[0]?.redemptions ?? 1;
                  return (
                    <li key={reward.rewardId} className="flex flex-col gap-1">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="truncate">
                          <span className="text-muted-foreground">{i + 1}.</span> {reward.name}
                        </span>
                        <span className="font-medium tabular-nums">
                          {formatNumber(reward.redemptions)}
                        </span>
                      </div>
                      <div aria-hidden className="h-1.5 rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-chart-1"
                          style={{ width: `${(reward.redemptions / max) * 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
