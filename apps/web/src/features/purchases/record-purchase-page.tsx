'use client';

import { type Customer, type PurchaseResult, RecordPurchaseSchema } from '@pointshub/shared';
import { CheckCircle2, Search, UserPlus, X } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader } from '@/components/app/page-header';
import { useTenant } from '@/components/app/tenant-context';
import { FormError } from '@/components/form-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, ErrorState, LoadingRows } from '@/components/ui/feedback';
import { describedBy, Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api/client';
import { useCustomer, useCustomerSearch, useRecordPurchase } from '@/lib/api/customers';
import { useProgram } from '@/lib/api/program';
import { applyServerErrors, zodResolver } from '@/lib/forms';
import { formatMoney, formatNumber } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { CreateCustomerDialog } from '../customers/customer-dialogs';

const PurchaseForm = RecordPurchaseSchema.omit({ customerId: true }).extend({
  externalRef: z
    .string()
    .trim()
    .transform((v) => v || undefined)
    .pipe(RecordPurchaseSchema.shape.externalRef),
});

export function RecordPurchasePage() {
  const tenant = useTenant();
  const preselected = useSearchParams().get('customerId');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [result, setResult] = useState<{ customer: Customer; purchase: PurchaseResult } | null>(
    null,
  );

  return (
    <>
      <PageHeader
        title="Record purchase"
        description="Find the customer, enter the amount, done."
      />
      <div className="grid max-w-3xl gap-6">
        {result && (
          <PurchaseConfirmation
            result={result.purchase}
            customer={result.customer}
            tenantId={tenant.tenantId}
            onDismiss={() => setResult(null)}
          />
        )}
        {customer ? (
          <PurchaseCard
            tenantId={tenant.tenantId}
            customer={customer}
            onChangeCustomer={() => setCustomer(null)}
            onRecorded={(purchase) => {
              setResult({ customer, purchase });
              setCustomer(null);
            }}
          />
        ) : preselected && !result ? (
          <PreselectedCustomer
            tenantId={tenant.tenantId}
            customerId={preselected}
            onLoaded={setCustomer}
          />
        ) : (
          <CustomerPicker tenantId={tenant.tenantId} onPick={setCustomer} />
        )}
      </div>
    </>
  );
}

function PreselectedCustomer({
  tenantId,
  customerId,
  onLoaded,
}: {
  tenantId: string;
  customerId: string;
  onLoaded: (customer: Customer) => void;
}) {
  const customer = useCustomer(tenantId, customerId);
  useEffect(() => {
    if (customer.data) onLoaded(customer.data);
  }, [customer.data, onLoaded]);
  if (customer.isError) {
    return (
      <ErrorState message={errorMessage(customer.error)} onRetry={() => void customer.refetch()} />
    );
  }
  return <LoadingRows rows={3} label="Loading customer" />;
}

function CustomerPicker({ tenantId, onPick }: { tenantId: string; onPick: (c: Customer) => void }) {
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim(), 250);
  const results = useCustomerSearch(tenantId, term);
  const [adding, setAdding] = useState(false);
  const looksLikeEmail = term.includes('@');

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Customer</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            autoFocus
            aria-label="Search by email, phone or name"
            placeholder="Email, phone or name"
            className="h-11 pl-9 text-base"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {term && results.isPending && <LoadingRows rows={2} label="Searching" />}
        {results.isError && <Alert variant="destructive">{errorMessage(results.error)}</Alert>}
        {term && results.data && (
          <div aria-live="polite">
            {results.data.data.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No customer matches “{term}”.</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-md border">
                {results.data.data.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onPick(c)}
                      className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.email}
                          {c.phone && ` · ${c.phone}`}
                        </span>
                      </span>
                      <span className="text-right text-sm tabular-nums">
                        {formatNumber(c.pointsBalance)} pts
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <Button variant="outline" onClick={() => setAdding(true)}>
            <UserPlus aria-hidden /> New customer
          </Button>
        </div>
      </CardContent>
      <CreateCustomerDialog
        tenantId={tenantId}
        open={adding}
        onOpenChange={setAdding}
        initialEmail={looksLikeEmail ? term : ''}
        onCreated={onPick}
      />
    </Card>
  );
}

function PurchaseCard({
  tenantId,
  customer,
  onChangeCustomer,
  onRecorded,
}: {
  tenantId: string;
  customer: Customer;
  onChangeCustomer: () => void;
  onRecorded: (result: PurchaseResult) => void;
}) {
  const program = useProgram(tenantId);
  const record = useRecordPurchase(tenantId);
  // One key per purchase: a retry after a timeout reuses it, so the API can only award once.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const form = useForm({
    resolver: zodResolver(PurchaseForm),
    defaultValues: { amount: '', externalRef: '' },
  });
  const { errors } = form.formState;
  const currency = program.data?.currency;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>2. Purchase for {customer.name}</CardTitle>
          <p className="truncate text-sm text-muted-foreground">
            {customer.email} · {formatNumber(customer.pointsBalance)} points
            {customer.tier && ` · ${customer.tier.name}`}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onChangeCustomer}>
          Change
        </Button>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((input) =>
            record.mutate(
              {
                input: { ...input, customerId: customer.id },
                idempotencyKey,
              },
              {
                onSuccess: (result) => {
                  setIdempotencyKey(crypto.randomUUID());
                  onRecorded(result);
                },
                onError: (error) => applyServerErrors(form, error),
              },
            ),
          )}
        >
          <FormError error={record.error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="amount"
              label={currency ? `Amount (${currency})` : 'Amount'}
              error={errors.amount?.message}
            >
              <Input
                inputMode="decimal"
                autoFocus
                autoComplete="off"
                placeholder="0.00"
                className="h-11 text-lg tabular-nums"
                {...describedBy('amount', errors.amount?.message)}
                {...form.register('amount')}
              />
            </Field>
            <Field
              id="externalRef"
              label="Receipt number (optional)"
              error={errors.externalRef?.message}
            >
              <Input
                autoComplete="off"
                className="h-11"
                {...describedBy('externalRef', errors.externalRef?.message)}
                {...form.register('externalRef')}
              />
            </Field>
          </div>
          <Button type="submit" size="lg" disabled={record.isPending}>
            {record.isPending ? 'Recording…' : 'Record purchase'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PurchaseConfirmation({
  result,
  customer,
  tenantId,
  onDismiss,
}: {
  result: PurchaseResult;
  customer: Customer;
  tenantId: string;
  onDismiss: () => void;
}) {
  return (
    <Card className="border-success/60" role="status">
      <CardContent className="flex items-start gap-4 p-5">
        <CheckCircle2 className="mt-1 size-6 shrink-0 text-success" aria-hidden />
        <div className="flex-1">
          <p className="text-lg font-semibold">
            +{formatNumber(result.pointsEarned)} points for {customer.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatMoney(result.purchase.amount, result.purchase.currency)} recorded. New balance{' '}
            {formatNumber(result.balance)} points.
          </p>
          {result.tierChanged && result.tier && (
            <p className="mt-2 text-sm">
              Moved up to <Badge>{result.tier.name}</Badge>
            </p>
          )}
          <Link
            href={`/app/${tenantId}/customers/${customer.id}`}
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            View customer
          </Link>
        </div>
        <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={onDismiss}>
          <X aria-hidden />
        </Button>
      </CardContent>
    </Card>
  );
}
