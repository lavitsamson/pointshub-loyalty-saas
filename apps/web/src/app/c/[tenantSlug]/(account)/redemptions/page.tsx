import type { Metadata } from 'next';
import { PortalRedemptionsPage } from '@/features/portal/account-pages';

export const metadata: Metadata = { title: 'My codes' };

export default function Page() {
  return <PortalRedemptionsPage />;
}
