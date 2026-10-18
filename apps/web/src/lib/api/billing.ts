'use client';

import { type BillingOverview, type BillingRedirect, PLAN_LIMIT_PROBLEM } from '@pointshub/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from './client';
import { keys } from './keys';
import { tenantPath } from './shared';

const POLL_INTERVAL_MS = 2000;

/**
 * `pollUntilPro` refetches every few seconds until the business is on Pro: Stripe confirms an
 * upgrade by webhook, shortly after the browser returns from Checkout.
 */
export function useBillingOverview(tenantId: string, { pollUntilPro = false } = {}) {
  return useQuery({
    queryKey: keys.area(tenantId, 'billing'),
    queryFn: ({ signal }) => api.get<BillingOverview>(`${tenantPath(tenantId)}/billing`, signal),
    refetchInterval: (q) =>
      pollUntilPro && q.state.data?.plan !== 'PRO' ? POLL_INTERVAL_MS : false,
  });
}

/** Both Stripe pages are full-page redirects; the mutation stays pending while the browser leaves. */
function useStripeRedirect(tenantId: string, page: 'checkout' | 'portal') {
  return useMutation({
    mutationFn: () => api.post<BillingRedirect>(`${tenantPath(tenantId)}/billing/${page}`),
    onSuccess: ({ url }) => window.location.assign(url),
  });
}

export const useStartCheckout = (tenantId: string) => useStripeRedirect(tenantId, 'checkout');
export const useOpenBillingPortal = (tenantId: string) => useStripeRedirect(tenantId, 'portal');

/** The API's 402: the action needs a higher plan. */
export function isPlanLimit(error: unknown): error is ApiError {
  return error instanceof ApiError && error.problem.type === PLAN_LIMIT_PROBLEM;
}
