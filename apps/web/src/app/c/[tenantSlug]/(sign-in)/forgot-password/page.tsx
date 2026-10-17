import type { Metadata } from 'next';
import { PortalForgotPasswordForm } from '@/features/portal/portal-auth-forms';

export const metadata: Metadata = { title: 'Forgotten password' };

export default function Page() {
  return <PortalForgotPasswordForm />;
}
