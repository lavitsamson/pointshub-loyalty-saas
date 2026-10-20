'use client';

import type {
  AcceptInvitationInput,
  CompleteRegistrationInput,
  ForgotPasswordInput,
  InvitationPreview,
  LoginInput,
  MeResponse,
  RegisterInput,
  ResetPasswordInput,
} from '@pointshub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isApiError } from './client';
import { keys } from './keys';

/** The signed-in user, or null when there is no valid session. */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async ({ signal }) => {
      try {
        return await api.get<MeResponse>('/auth/me', signal);
      } catch (error) {
        if (isApiError(error, 401)) return null;
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Signing in, finishing sign-up or accepting an invite all return the new session's user. */
function useSessionMutation<TInput>(request: (input: TInput) => Promise<MeResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (me) => {
      // A different user may have signed in on this device: drop everything cached.
      queryClient.clear();
      queryClient.setQueryData(keys.me, me);
    },
  });
}

export const useLogin = () =>
  useSessionMutation((input: LoginInput) => api.post<MeResponse>('/auth/login', input));

/** Emails a link to finish signing up; the answer is the same whether or not the email is new. */
export const useRegister = () =>
  useMutation({ mutationFn: (input: RegisterInput) => api.post<void>('/auth/register', input) });

export const useCompleteRegistration = () =>
  useSessionMutation((input: CompleteRegistrationInput) =>
    api.post<MeResponse>('/auth/complete-registration', input),
  );

export const useAcceptInvitation = (token: string) =>
  useSessionMutation((input: AcceptInvitationInput) =>
    api.post<MeResponse>(`/invitations/${encodeURIComponent(token)}/accept`, input),
  );

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(keys.me, null);
    },
  });
}

export const useForgotPassword = () =>
  useMutation({
    mutationFn: (input: ForgotPasswordInput) => api.post<void>('/auth/forgot-password', input),
  });

export const useResetPassword = () =>
  useMutation({
    mutationFn: (input: ResetPasswordInput) => api.post<void>('/auth/reset-password', input),
  });

export function useInvitationPreview(token: string) {
  return useQuery({
    queryKey: keys.invitation(token),
    queryFn: ({ signal }) =>
      api.get<InvitationPreview>(`/invitations/${encodeURIComponent(token)}`, signal),
    retry: false,
  });
}
