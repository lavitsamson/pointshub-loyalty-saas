import type { MeResponse } from '@pointshub/shared';

/**
 * Where to go after signing in. Only same-site paths are honoured, so a crafted
 * ?next=https://evil.example link cannot turn the login page into an open redirect.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next?.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}

export const dashboardPath = (tenantId: string) => `/app/${tenantId}/dashboard`;

/** Home after signing in: straight into the business if there is only one. */
export function homeFor(me: MeResponse): string {
  const only = me.memberships.length === 1 ? me.memberships[0] : undefined;
  return only ? dashboardPath(only.tenantId) : '/app';
}
