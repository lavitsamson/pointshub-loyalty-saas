'use client';

import type {
  Campaign,
  CreateCampaignInput,
  CreateTierInput,
  LoyaltyProgram,
  Paginated,
  Tenant,
  Tier,
  UpdateCampaignInput,
  UpdateLoyaltyProgramInput,
  UpdateTenantInput,
  UpdateTierInput,
} from '@pointshub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, query } from './client';
import { keys } from './keys';
import { ALL, tenantPath, useInvalidate } from './shared';

export function useTenantDetails(tenantId: string) {
  return useQuery({
    queryKey: keys.tenant(tenantId),
    queryFn: ({ signal }) => api.get<Tenant>(tenantPath(tenantId), signal),
  });
}

export function useUpdateTenant(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTenantInput) => api.patch<Tenant>(tenantPath(tenantId), input),
    onSuccess: async (tenant) => {
      queryClient.setQueryData(keys.tenant(tenantId), tenant);
      // The business name also appears in the user's membership list.
      await queryClient.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useProgram(tenantId: string) {
  return useQuery({
    queryKey: keys.area(tenantId, 'program'),
    queryFn: ({ signal }) => api.get<LoyaltyProgram>(`${tenantPath(tenantId)}/program`, signal),
  });
}

export function useUpdateProgram(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateLoyaltyProgramInput) =>
      api.patch<LoyaltyProgram>(`${tenantPath(tenantId)}/program`, input),
    onSuccess: (program) => queryClient.setQueryData(keys.area(tenantId, 'program'), program),
  });
}

export function useTiers(tenantId: string) {
  return useQuery({
    queryKey: keys.list(tenantId, 'tiers'),
    queryFn: async ({ signal }) =>
      (await api.get<Paginated<Tier>>(`${tenantPath(tenantId)}/tiers${query(ALL)}`, signal)).data,
  });
}

export function useSaveTier(tenantId: string) {
  const invalidate = useInvalidate(tenantId);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateTierInput | UpdateTierInput }) =>
      id
        ? api.patch<Tier>(`${tenantPath(tenantId)}/tiers/${id}`, input)
        : api.post<Tier>(`${tenantPath(tenantId)}/tiers`, input),
    onSuccess: () => invalidate('tiers'),
  });
}

export function useDeleteTier(tenantId: string) {
  const invalidate = useInvalidate(tenantId);
  return useMutation({
    mutationFn: (id: string) => api.delete(`${tenantPath(tenantId)}/tiers/${id}`),
    onSuccess: () => invalidate('tiers'),
  });
}

export function useCampaigns(tenantId: string) {
  return useQuery({
    queryKey: keys.list(tenantId, 'campaigns'),
    queryFn: async ({ signal }) =>
      (await api.get<Paginated<Campaign>>(`${tenantPath(tenantId)}/campaigns${query(ALL)}`, signal))
        .data,
  });
}

export function useSaveCampaign(tenantId: string) {
  const invalidate = useInvalidate(tenantId);
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id?: string;
      input: CreateCampaignInput | UpdateCampaignInput;
    }) =>
      id
        ? api.patch<Campaign>(`${tenantPath(tenantId)}/campaigns/${id}`, input)
        : api.post<Campaign>(`${tenantPath(tenantId)}/campaigns`, input),
    onSuccess: () => invalidate('campaigns'),
  });
}

export function useDeleteCampaign(tenantId: string) {
  const invalidate = useInvalidate(tenantId);
  return useMutation({
    mutationFn: (id: string) => api.delete(`${tenantPath(tenantId)}/campaigns/${id}`),
    onSuccess: () => invalidate('campaigns'),
  });
}
