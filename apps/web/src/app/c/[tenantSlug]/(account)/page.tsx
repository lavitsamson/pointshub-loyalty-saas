import type { Metadata } from 'next';
import { PortalHomePage } from '@/features/portal/account-pages';

export const metadata: Metadata = { title: 'Your rewards' };

export default function Page() {
  return <PortalHomePage />;
}
