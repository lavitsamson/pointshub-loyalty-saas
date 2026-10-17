import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PortalLoginForm } from '@/features/portal/portal-auth-forms';

export const metadata: Metadata = { title: 'Sign in' };

export default function Page() {
  return (
    <Suspense>
      <PortalLoginForm />
    </Suspense>
  );
}
