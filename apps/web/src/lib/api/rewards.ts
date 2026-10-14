'use client';

import type {
  CreateRedemptionInput,
  CreateRewardInput,
  Paginated,
  Redemption,
  RedemptionStatus,
  Reward,
  UpdateRewardInput,
} from '@pointshub/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, query } from './client';
import { keys } from './keys';
import { tenantPath, useInvalidate, usePaginatedList } from './shared';

export function useRewards(tenantId: string, params: { active?: 'true' | 'false' } = {}) {
  return usePaginatedList<Reward>(tenantId, 'rewards', `${tenantPath(tenantId)}/rewards`, {
    limit: 50,
    ...params,
  });
}

export function useSaveReward(tenantId: string) {
  const invalidate = useInvalidate(tenantId);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateRewardInput | UpdateRewardInput }) =>
      id
        ? api.patch<Reward>(`${tenantPath(tenantId)}/rewards/${id}`, input)
        : api.post<Reward>(`${tenantPath(tenantId)}/rewards`, input),
    onSuccess: () => invalidate('rewards', 'analytics'),
  });
}

export function useDeleteReward(tenantId: string) {
  const invalidate = useInvalidate(tenantId);
  return useMutation({
    mutationFn: (id: string) => api.delete(`${tenantPath(tenantId)}/rewards/${id}`),
    onSuccess: () => invalidate('rewards', 'analytics'),
  });
}

export function useRedemptions(
  tenantId: string,
  params: { status?: RedemptionStatus; customerId?: string } = {},
) {
  return usePaginatedList<Redemption>(
    tenantId,
    'redemptions',
    `${tenantPath(tenantId)}/redemptions`,
    params,
  );
}

/** Looks a redemption up by the code a customer reads out at the counter. */
export function useRedemptionByCode(tenantId: string, code: string) {
  return useQuery({
    queryKey: keys.list(tenantId, 'redemptions', { code }),
    queryFn: async ({ signal }) =>
      (
        await api.get<Paginated<Redemption>>(
          `${tenantPath(tenantId)}/redemptions${query({ code, limit: 1 })}`,
          signal,
        )
      ).data[0] ?? null,
    enabled: code.length > 0,
  });
}

/** Creating, fulfilling or cancelling a redemption moves points and stock. */
const affected = ['redemptions', 'customers', 'rewards', 'analytics'] as const;

export function useRedeem(tenantId: string) {
  const invalidate = useInvalidate(tenantId);
  return useMutation({
    mutationFn: (input: CreateRedemptionInput) =>
      api.post<Redemption>(`${tenantPath(tenantId)}/redemptions`, input),
    onSuccess: () => invalidate(...affected),
  });
}

export function useFulfilRedemption(tenantId: string) {
  const invalidate = useInvalidate(tenantId);
  return useMutation({
    mutationFn: (id: string) =>
      api.post<Redemption>(`${tenantPath(tenantId)}/redemptions/${id}/fulfil`),
    onSuccess: () => invalidate(...affected),
  });
}

export function useCancelRedemption(tenantId: string) {
  const invalidate = useInvalidate(tenantId);
  return useMutation({
    mutationFn: (id: string) =>
      api.post<Redemption>(`${tenantPath(tenantId)}/redemptions/${id}/cancel`),
    onSuccess: () => invalidate(...affected),
  });
}
