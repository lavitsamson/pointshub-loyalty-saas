'use client';

import type {
  AuditLogEntry,
  CreateInvitationInput,
  Invitation,
  Member,
  UpdateMemberInput,
} from '@pointshub/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './keys';
import { tenantPath, useInvalidate, usePaginatedList } from './shared';

export function useMembers(tenantId: string) {
  return usePaginatedList<Member>(tenantId, 'members', `${tenantPath(tenantId)}/members`, {
    limit: 100,
  });
}

export function useInvitations(tenantId: string) {
  return usePaginatedList<Invitation>(
    tenantId,
    'invitations',
    `${tenantPath(tenantId)}/invitations`,
    { limit: 100 },
  );
}

export function useInvite(tenantId: string) {
  const invalidate = useInvalidate(tenantId);
  return useMutation({
    mutationFn: (input: CreateInvitationInput) =>
      api.post<Invitation>(`${tenantPath(tenantId)}/invitations`, input),
    onSuccess: () => invalidate('invitations', 'audit'),
  });
}

export function useRevokeInvitation(tenantId: string) {
  const invalidate = useInvalidate(tenantId);
  return useMutation({
    mutationFn: (id: string) => api.delete(`${tenantPath(tenantId)}/invitations/${id}`),
    onSuccess: () => invalidate('invitations', 'audit'),
  });
}

export function useChangeRole(tenantId: string) {
  const invalidate = useInvalidate(tenantId);
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: UpdateMemberInput }) =>
      api.patch<Member>(`${tenantPath(tenantId)}/members/${userId}`, input),
    onSuccess: () => invalidate('members', 'audit'),
  });
}

/** Removes a member, or — for the current user — leaves the business. */
export function useRemoveMember(tenantId: string) {
  const invalidate = useInvalidate(tenantId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.delete(`${tenantPath(tenantId)}/members/${userId}`),
    onSuccess: async () => {
      await invalidate('members', 'audit');
      await queryClient.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useAuditLog(tenantId: string) {
  return usePaginatedList<AuditLogEntry>(tenantId, 'audit', `${tenantPath(tenantId)}/audit-logs`, {
    limit: 25,
  });
}
