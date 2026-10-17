'use client';

import type {
  ForgotPasswordInput,
  LedgerEntry,
  LoginInput,
  PortalBusiness,
  PortalMe,
  PortalRedemption,
  PortalRegisterInput,
  PortalSetPasswordInput,
  Reward,
} from '@pointshub/shared';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isApiError } from './client';
import { keys, type PortalArea } from './keys';
import { useCursorList } from './shared';

/** Base path for one business's portal. */
export const portalPath = (slug: string) => `/portal/${encodeURIComponent(slug)}`;

const AREAS: PortalArea[] = ['ledger', 'rewards', 'redemptions'];

/**
 * A different customer may now be signed in to this portal: drop their cached account data.
 * Only this portal's cache is touched; a merchant session in the same browser is unaffected.
 */
function resetAccount(queryClient: QueryClient, slug: string, me: PortalMe | null) {
  for (const area of AREAS) queryClient.removeQueries({ queryKey: keys.portalArea(slug, area) });
  queryClient.setQueryData(keys.portalMe(slug), me);
}

export function usePortalBusiness(slug: string) {
  return useQuery({
    queryKey: keys.portalBusiness(slug),
    queryFn: ({ signal }) => api.get<PortalBusiness>(portalPath(slug), signal),
    staleTime: 10 * 60 * 1000,
    retry: (count, error) => !isApiError(error, 404) && count < 2,
  });
}

/** The signed-in customer, or null when there is no session for this portal. */
export function usePortalMe(slug: string) {
  return useQuery({
    queryKey: keys.portalMe(slug),
    queryFn: async ({ signal }) => {
      try {
        return await api.get<PortalMe>(`${portalPath(slug)}/me`, signal);
      } catch (error) {
        if (isApiError(error, 401)) return null;
        throw error;
      }
    },
  });
}

function useSignIn<TInput>(slug: string, request: (input: TInput) => Promise<PortalMe>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (me) => resetAccount(queryClient, slug, me),
  });
}

export const usePortalLogin = (slug: string) =>
  useSignIn(slug, (input: LoginInput) =>
    api.post<PortalMe>(`${portalPath(slug)}/auth/login`, input),
  );

export const usePortalSetPassword = (slug: string) =>
  useSignIn(slug, (input: PortalSetPasswordInput) =>
    api.post<PortalMe>(`${portalPath(slug)}/auth/set-password`, input),
  );

/** Emails a link to choose a password; the customer is signed in when they use it. */
export const usePortalRegister = (slug: string) =>
  useMutation({
    mutationFn: (input: PortalRegisterInput) =>
      api.post<void>(`${portalPath(slug)}/auth/register`, input),
  });

export function usePortalLogout(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>(`${portalPath(slug)}/auth/logout`),
    onSettled: () => resetAccount(queryClient, slug, null),
  });
}

export const usePortalForgotPassword = (slug: string) =>
  useMutation({
    mutationFn: (input: ForgotPasswordInput) =>
      api.post<void>(`${portalPath(slug)}/auth/forgot-password`, input),
  });

export const usePortalLedger = (slug: string) =>
  useCursorList<LedgerEntry>(keys.portalArea(slug, 'ledger'), `${portalPath(slug)}/me/ledger`);

export const usePortalRewards = (slug: string) =>
  useCursorList<Reward>(keys.portalArea(slug, 'rewards'), `${portalPath(slug)}/rewards`, {
    limit: 50,
  });

export const usePortalRedemptions = (slug: string) =>
  useCursorList<PortalRedemption>(
    keys.portalArea(slug, 'redemptions'),
    `${portalPath(slug)}/me/redemptions`,
  );

/** Spends points, so the balance is refetched rather than updated optimistically. */
export function usePortalRedeem(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rewardId: string) =>
      api.post<PortalRedemption>(`${portalPath(slug)}/redemptions`, { rewardId }),
    onSuccess: () =>
      Promise.all(
        [keys.portalMe(slug), ...AREAS.map((area) => keys.portalArea(slug, area))].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}
