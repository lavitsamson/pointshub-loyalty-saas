'use client';

import { type Customer, type CustomerSort, Permission } from '@pointshub/shared';
import { ChevronLeft, ChevronRight, Download, Plus, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/app/page-header';
import { useTenant } from '@/components/app/tenant-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/feedback';
import { Checkbox, Input, Select } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/api/client';
import { customerExportUrl, useCustomerPage } from '@/lib/api/customers';
import { useTiers } from '@/lib/api/program';
import { formatDate, formatNumber } from '@/lib/format';
import { useCursorPager, useDebounced, useDialogs } from '@/lib/hooks';
import { BulkActionDialog, type BulkKind, CreateCustomerDialog } from './customer-dialogs';

const PAGE_SIZE = 25;

const SORTS: Array<{ value: CustomerSort; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'points', label: 'Most points' },
];

export function CustomersPage() {
  const tenant = useTenant();
  const router = useRouter();
  const tiers = useTiers(tenant.tenantId);
  const canBulk = tenant.can(Permission.BulkActions);
  const canExport = tenant.can(Permission.ExportData);

  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [tierId, setTierId] = useState('');
  const [sort, setSort] = useState<CustomerSort>('newest');
  const filter = {
    q: useDebounced(search.trim()) || undefined,
    tag: useDebounced(tag.trim().toLowerCase()) || undefined,
    tierId: tierId || undefined,
    sort,
  };
  const pager = useCursorPager(JSON.stringify(filter));
  const page = useCustomerPage(tenant.tenantId, {
    ...filter,
    limit: PAGE_SIZE,
    cursor: pager.cursor,
  });
  const rows = page.data?.data ?? [];

  // Selection survives paging, so a bulk action can span several pages.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allOnPage = rows.length > 0 && rows.every((c) => selected.has(c.id));
  const someOnPage = rows.some((c) => selected.has(c.id));
  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const createDialog = useDialogs<'create'>();
  const [bulk, setBulk] = useState<BulkKind | null>(null);
  const filtered = Boolean(filter.q ?? filter.tag ?? filter.tierId);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone enrolled in your loyalty programme."
        actions={
          <>
            {canExport && (
              <Button asChild variant="outline">
                <a href={customerExportUrl(tenant.tenantId, filter)} download>
                  <Download aria-hidden /> Export CSV
                </a>
              </Button>
            )}
            <Button onClick={() => createDialog.show('create')}>
              <Plus aria-hidden /> Add customer
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              aria-label="Search customers by name, email or phone"
              placeholder="Search name, email or phone"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex">
            <Select
              aria-label="Filter by tier"
              value={tierId}
              onChange={(e) => setTierId(e.target.value)}
              className="lg:w-36"
            >
              <option value="">All tiers</option>
              {tiers.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Input
              aria-label="Filter by tag"
              placeholder="Tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="lg:w-36"
            />
            <Select
              aria-label="Sort customers"
              value={sort}
              onChange={(e) => setSort(e.target.value as CustomerSort)}
              className="lg:w-40"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {canBulk && selected.size > 0 && (
          <div
            role="region"
            aria-label="Bulk actions"
            className="flex flex-wrap items-center gap-2 border-b bg-secondary/60 px-4 py-2.5 text-sm"
          >
            <span className="font-medium">{formatNumber(selected.size)} selected</span>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X aria-hidden /> Clear
            </Button>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setBulk('ADJUST_POINTS')}>
                Adjust points
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBulk('ADD_TAG')}>
                Add tag
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBulk('REMOVE_TAG')}>
                Remove tag
              </Button>
            </div>
          </div>
        )}

        <div className="p-2">
          {page.isPending ? (
            <LoadingRows rows={8} label="Loading customers" />
          ) : page.isError ? (
            <ErrorState message={errorMessage(page.error)} onRetry={() => void page.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              title={filtered ? 'No customers match' : 'No customers yet'}
              description={
                filtered
                  ? 'Try a different search or clear the filters.'
                  : 'Add your first customer, or record a purchase to enrol one at the till.'
              }
            />
          ) : (
            <Table aria-busy={page.isFetching}>
              <TableHeader>
                <TableRow>
                  {canBulk && (
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Select all customers on this page"
                        checked={allOnPage}
                        ref={(el) => {
                          if (el) el.indeterminate = someOnPage && !allOnPage;
                        }}
                        onChange={(e) =>
                          toggle(
                            rows.map((c) => c.id),
                            e.target.checked,
                          )
                        }
                      />
                    </TableHead>
                  )}
                  <TableHead>Customer</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Lifetime</TableHead>
                  <TableHead className="hidden lg:table-cell">Tags</TableHead>
                  <TableHead className="hidden sm:table-cell">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((customer) => (
                  <CustomerRow
                    key={customer.id}
                    customer={customer}
                    href={`/app/${tenant.tenantId}/customers/${customer.id}`}
                    selectable={canBulk}
                    selected={selected.has(customer.id)}
                    onSelect={(on) => toggle([customer.id], on)}
                    onOpen={(href) => router.push(href)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {rows.length > 0 && (
          <nav
            aria-label="Pagination"
            className="flex items-center justify-between border-t px-4 py-3 text-sm"
          >
            <span className="text-muted-foreground">Page {pager.page}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!pager.hasPrevious}
                onClick={pager.previous}
              >
                <ChevronLeft aria-hidden /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!page.data?.pageInfo.nextCursor || page.isPlaceholderData}
                onClick={() => {
                  const next = page.data?.pageInfo.nextCursor;
                  if (next) pager.next(next);
                }}
              >
                Next <ChevronRight aria-hidden />
              </Button>
            </div>
          </nav>
        )}
      </Card>

      <CreateCustomerDialog tenantId={tenant.tenantId} {...createDialog.props('create')} />
      <BulkActionDialog
        tenantId={tenant.tenantId}
        kind={bulk}
        customerIds={[...selected]}
        onOpenChange={(open) => !open && setBulk(null)}
        onDone={() => {
          setBulk(null);
          setSelected(new Set());
        }}
      />
    </>
  );
}

function CustomerRow({
  customer,
  href,
  selectable,
  selected,
  onSelect,
  onOpen,
}: {
  customer: Customer;
  href: string;
  selectable: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onOpen: (href: string) => void;
}) {
  return (
    <TableRow
      data-state={selected ? 'selected' : undefined}
      className="cursor-pointer hover:bg-muted/60"
      // The whole row is clickable for mouse users; the name link is the keyboard target.
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('a,input,button')) onOpen(href);
      }}
    >
      {selectable && (
        <TableCell>
          <Checkbox
            aria-label={`Select ${customer.name}`}
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
          />
        </TableCell>
      )}
      <TableCell>
        <Link href={href} className="font-medium hover:underline">
          {customer.name}
        </Link>
        <div className="text-xs text-muted-foreground">{customer.email}</div>
      </TableCell>
      <TableCell>{customer.tier ? <Badge>{customer.tier.name}</Badge> : '—'}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {formatNumber(customer.pointsBalance)}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums md:table-cell">
        {formatNumber(customer.lifetimePoints)}
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <div className="flex flex-wrap gap-1">
          {customer.tags.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">
        {formatDate(customer.createdAt)}
      </TableCell>
    </TableRow>
  );
}
