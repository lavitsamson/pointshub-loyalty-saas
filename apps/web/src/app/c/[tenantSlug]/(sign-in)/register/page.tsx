import type { Metadata } from 'next';
import { PortalRegisterForm } from '@/features/portal/portal-auth-forms';

export const metadata: Metadata = { title: 'Join' };

export default function Page() {
  return <PortalRegisterForm />;
}
