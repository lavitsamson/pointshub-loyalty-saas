'use client';

import {
  type AdjustPointsInput,
  type BulkActionInput,
  type BulkActionResult,
  type CreateCustomerInput,
  type Customer,
  type CustomerFilter,
  IDEMPOTENCY_KEY_HEADER,
  type LedgerEntry,
  type Paginated,
  type PurchaseResult,
  type RecordPurchaseInput,
  type UpdateCustomerInput,
} from '@pointshub/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_BASE, query } from './client';
import { keys } from './keys';
import { tenantPath, useInvalidate, usePaginatedList } from './shared';

export type CustomerListParams = Partial<CustomerFilter> & { limit?: number };

/** One page of the customer table; the previous page stays on screen while the next loads. */
export function useCustomerPage(
  tenantId: string,
  params: CustomerListParams & { cursor?: string | undefined },
) {
  return useQuery({
    queryKey: keys.list(tenantId, 'customers', params),
    queryFn: ({ signal }) =>
      api.get<Paginated<Customer>>(`${tenantPath(tenantId)}/customers${query(params)}`, signal),
    placeholderData: keepPreviousData,
  });
}

/** Quick lookup by name, email or phone, e.g. at the till. */
export function useCustomerSearch(tenantId: string, q: string) {
  return useQuery({
    queryKey: keys.list(tenantId, 'customers', { q, limit: 8 }),
    queryFn: ({ signal }) =>
      api.get<Paginated<Customer>>(
        `${tenantPath(tenantId)}/customers${query({ q, limit: 8 })}`,
        signal,
      ),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(tenantId: string, customerId: string) {
  return useQuery({
    queryKey: keys.item(tenantId, 'customers', customerId),
    queryFn: ({ signal }) =>
      api.get<Customer>(`${tenantPath(tenantId)}/customers/${customerId}`, signal),
  });
}

export function useLedger(tenantId: string, customerId: string) {
  return usePaginatedList<LedgerEntry>(
    tenantId,
    'customers',
    `${tenantPath(tenantId)}/customers/${customerId}/ledger`,
  );
}

/** Link target for the CSV download; the browser sends the session cookie with it. */
export function customerExportUrl(tenantId: string, filter: Partial<CustomerFilter>): string {
  return `${API_BASE}${tenantPath(tenantId)}/customers/export${query(filter)}`;
}

export function useCreateCustomer(tenantId: string) {
  const invalidate = useInvalidate(tenantId);
  return useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      api.post<Customer>(`${tenantPath(tenantId)}/customers`, input),
    onSuccess: () => invalidate('customers', 'analytics'),
  });
}

export function useUpdateCustomer(tenantId: string, customerId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidate(tenantId);
  return useMutation({
    mutationFn: (input: UpdateCustomerInput) =>
      api.patch<Customer>(`${tenantPath(tenantId)}/customers/${customerId}`, input),
    onSuccess: async (customer) => {
      queryClient.setQueryData(keys.item(tenantId, 'customers', customerId), customer);
      await invalidate('customers');
    },
  });
}

export function useAdjustPoints(tenantId: string, customerId: string) {
  const invalidate = useInvalidate(tenantId);
  return useMutation({
    mutationFn: (input: AdjustPointsInput) =>
      api.post<LedgerEntry>(`${tenantPath(tenantId)}/customers/${customerId}/adjustments`, input),
    onSuccess: () => invalidate('customers', 'analytics'),
  });
}

export function useBulkAction(tenantId: string) {
  const invalidate = useInvalidate(tenantId);
  return useMutation({
    mutationFn: (input: BulkActionInput) =>
      api.post<BulkActionResult>(`${tenantPath(tenantId)}/customers/bulk`, input),
    onSuccess: () => invalidate('customers', 'analytics'),
  });
}

/**
 * Records a purchase. The caller supplies the Idempotency-Key and keeps it until the purchase
 * is confirmed, so retrying after a timeout can never award points twice.
 */
export function useRecordPurchase(tenantId: string) {
  const invalidate = useInvalidate(tenantId);
  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: RecordPurchaseInput;
      idempotencyKey: string;
    }) =>
      api.post<PurchaseResult>(`${tenantPath(tenantId)}/purchases`, input, {
        [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
      }),
    onSuccess: () => invalidate('customers', 'analytics'),
  });
}
