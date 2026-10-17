import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PortalSetPasswordForm } from '@/features/portal/portal-auth-forms';

export const metadata: Metadata = { title: 'Choose your password' };

export default function Page() {
  return (
    <Suspense>
      <PortalSetPasswordForm />
    </Suspense>
  );
}
