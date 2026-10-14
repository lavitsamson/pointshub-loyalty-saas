'use client';

import { can, type MembershipSummary, type Permission } from '@pointshub/shared';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

interface TenantContextValue extends MembershipSummary {
  /** Whether the current member's role allows an action; mirrors the API's guard. */
  can: (permission: Permission) => boolean;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({
  membership,
  children,
}: {
  membership: MembershipSummary;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ ...membership, can: (p: Permission) => can(membership.role, p) }),
    [membership],
  );
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

/** The business named in the URL and the current member's role in it. */
export function useTenant(): TenantContextValue {
  const tenant = useContext(TenantContext);
  if (!tenant) throw new Error('useTenant must be used inside <TenantProvider>');
  return tenant;
}
