'use client';

import type { MembershipSummary } from '@pointshub/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app/app-shell';
import { useSession } from '@/components/app/session-gate';
import { TenantProvider } from '@/components/app/tenant-context';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';
import { useTenantDetails } from '@/lib/api/program';

export default function TenantLayout({ children }: { children: ReactNode }) {
  const { tenantId } = useParams<{ tenantId: string }>();
  const membership = useSession().memberships.find((m) => m.tenantId === tenantId);

  // Same answer for "does not exist" and "not yours", mirroring the API's 404.
  if (!membership) {
    return (
      <main id="main" className="mx-auto max-w-md p-6">
        <EmptyState
          title="Business not found"
          description="It may have been removed, or you are not a member of it."
          action={
            <Button asChild variant="outline">
              <Link href="/app">Your businesses</Link>
            </Button>
          }
        />
      </main>
    );
  }
  return <TenantShell membership={membership}>{children}</TenantShell>;
}

function TenantShell({
  membership,
  children,
}: {
  membership: MembershipSummary;
  children: ReactNode;
}) {
  const tenant = useTenantDetails(membership.tenantId);
  return (
    <TenantProvider membership={membership}>
      <AppShell plan={tenant.data?.plan}>{children}</AppShell>
    </TenantProvider>
  );
}
