'use client';

import { type BillingOverview, Permission, PLAN_LIMITS, type Plan } from '@pointshub/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/app/page-header';
import { useTenant } from '@/components/app/tenant-context';
import { FormError } from '@/components/form-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, ErrorState, LoadingRows } from '@/components/ui/feedback';
import { toast } from '@/components/ui/toast';
import { useBillingOverview, useOpenBillingPortal, useStartCheckout } from '@/lib/api/billing';
import { errorMessage } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Stripe confirms an upgrade by webhook, usually within seconds of returning from Checkout. */
const CONFIRMATION_WAIT_MS = 60_000;

const PLAN_NAME: Record<Plan, string> = { FREE: 'Free', PRO: 'Pro' };

const FREE_CUSTOMERS = PLAN_LIMITS.FREE.maxCustomers ?? 0;

const PLAN_FEATURES: Record<Plan, string[]> = {
  FREE: [
    `Up to ${FREE_CUSTOMERS} customers`,
    'Points, tiers, campaigns and rewards',
    'Customer portal',
    'Team accounts and audit log',
  ],
  PRO: ['Unlimited customers', 'Everything in Free'],
};

export function BillingPage() {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const checkout = useSearchParams().get('checkout');
  const [waiting, setWaiting] = useState(checkout === 'success');
  const billing = useBillingOverview(tenant.tenantId, { pollUntilPro: waiting });
  const plan = billing.data?.plan;
  const confirming = waiting && plan !== 'PRO';

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setWaiting(false), CONFIRMATION_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  // Announce the upgrade only when it was seen happening, not on every visit to a Pro business.
  const sawFree = useRef(false);
  useEffect(() => {
    if (plan === 'FREE') sawFree.current = true;
    if (plan !== 'PRO' || !sawFree.current) return;
    sawFree.current = false;
    toast({ title: 'Welcome to Pro', variant: 'success' });
    // The plan badge in the header comes from the business details.
    void queryClient.invalidateQueries({ queryKey: keys.tenant(tenant.tenantId), exact: true });
  }, [plan, queryClient, tenant.tenantId]);

  return (
    <>
      <PageHeader title="Billing" description="Your plan and payment details." />
      <div className="flex flex-col gap-6">
        {checkout === 'success' && plan !== 'PRO' && (
          <Alert>
            {confirming
              ? 'Payment received. Confirming your upgrade with Stripe…'
              : 'Stripe has not confirmed the upgrade yet. This page will show Pro once it does; try refreshing in a minute.'}
          </Alert>
        )}
        {checkout === 'cancelled' && <Alert>Checkout cancelled. You have not been charged.</Alert>}

        {billing.isPending ? (
          <LoadingRows rows={4} label="Loading billing" />
        ) : billing.isError ? (
          <ErrorState
            message={errorMessage(billing.error)}
            onRetry={() => void billing.refetch()}
          />
        ) : (
          <>
            <CurrentPlan billing={billing.data} />
            <Plans current={billing.data.plan} />
          </>
        )}
      </div>
    </>
  );
}

function CurrentPlan({ billing }: { billing: BillingOverview }) {
  const tenant = useTenant();
  const canManage = tenant.can(Permission.ManageBilling);
  const startCheckout = useStartCheckout(tenant.tenantId);
  const openPortal = useOpenBillingPortal(tenant.tenantId);
  const isPro = billing.plan === 'PRO';

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>
            <PlanStatus billing={billing} />
          </CardDescription>
        </div>
        <Badge variant={isPro ? 'success' : 'muted'} className="text-sm">
          {PLAN_NAME[billing.plan]}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {isPro && billing.subscriptionStatus === 'past_due' && (
          <Alert variant="destructive">
            Your last payment failed. Pro stays on while Stripe retries the payment; update your
            payment details to keep it.
          </Alert>
        )}

        <CustomerUsage billing={billing} />

        <FormError error={startCheckout.error ?? openPortal.error} />
        {!billing.billingAvailable ? (
          <Alert>
            Online billing is not set up on this installation, so the plan cannot be changed here.
          </Alert>
        ) : !canManage ? (
          <p className="text-sm text-muted-foreground">
            Only the business owner can change the plan.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {!isPro && (
              <Button onClick={() => startCheckout.mutate()} disabled={startCheckout.isPending}>
                {startCheckout.isPending ? 'Opening Stripe…' : 'Upgrade to Pro'}
              </Button>
            )}
            {billing.hasBillingAccount && (
              <Button
                variant={isPro ? 'default' : 'outline'}
                onClick={() => openPortal.mutate()}
                disabled={openPortal.isPending}
              >
                {openPortal.isPending ? 'Opening Stripe…' : 'Manage billing'}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlanStatus({ billing }: { billing: BillingOverview }) {
  if (billing.plan === 'FREE') {
    return billing.subscriptionStatus === 'canceled'
      ? 'Your Pro subscription has ended.'
      : `Free, for up to ${formatNumber(FREE_CUSTOMERS)} customers.`;
  }
  if (!billing.hasBillingAccount) {
    return 'Pro without a Stripe subscription (demo data), so there is nothing to manage.';
  }
  const end = billing.currentPeriodEnd && formatDate(billing.currentPeriodEnd);
  if (billing.cancelAtPeriodEnd) {
    return end ? `Pro until ${end}, then Free.` : 'Pro until the end of the period, then Free.';
  }
  return end ? `Renews on ${end}.` : 'Active.';
}

function CustomerUsage({ billing }: { billing: BillingOverview }) {
  const { customers, customerLimit } = billing.usage;
  if (customerLimit === null) {
    return (
      <p className="text-sm">
        <span className="font-medium">{formatNumber(customers)}</span> customers ·{' '}
        <span className="text-muted-foreground">no limit</span>
      </p>
    );
  }

  const percent = Math.min(100, Math.round((customers / customerLimit) * 100));
  const full = customers >= customerLimit;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm">
        <span id="usage-label" className="font-medium">
          Customers
        </span>
        <span className={cn(full ? 'text-destructive' : 'text-muted-foreground')}>
          {formatNumber(customers)} of {formatNumber(customerLimit)}
        </span>
      </div>
      <div
        role="meter"
        aria-labelledby="usage-label"
        aria-valuemin={0}
        aria-valuemax={customerLimit}
        aria-valuenow={Math.min(customers, customerLimit)}
        aria-valuetext={`${customers} of ${customerLimit} customers`}
        className="h-2 rounded-full bg-muted"
      >
        <div
          className={cn('h-2 rounded-full', percent >= 90 ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${percent}%` }}
        />
      </div>
      {full && (
        <p className="text-sm text-destructive">
          The plan is full: new customers cannot join until you upgrade.
        </p>
      )}
    </div>
  );
}

function Plans({ current }: { current: Plan }) {
  return (
    <section aria-labelledby="plans-heading" className="flex flex-col gap-3">
      <h2 id="plans-heading" className="text-lg font-semibold">
        Plans
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['FREE', 'PRO'] as const).map((plan) => (
          <Card key={plan} className={cn(plan === current && 'border-primary')}>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>{PLAN_NAME[plan]}</CardTitle>
              {plan === current && <Badge variant="outline">Current plan</Badge>}
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm">
                {PLAN_FEATURES[plan].map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
