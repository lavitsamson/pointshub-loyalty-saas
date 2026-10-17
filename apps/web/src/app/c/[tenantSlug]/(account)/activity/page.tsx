import type { Metadata } from 'next';
import { PortalActivityPage } from '@/features/portal/account-pages';

export const metadata: Metadata = { title: 'Activity' };

export default function Page() {
  return <PortalActivityPage />;
}
