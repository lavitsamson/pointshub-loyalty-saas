import type { Metadata } from 'next';
import { PortalRewardsPage } from '@/features/portal/account-pages';

export const metadata: Metadata = { title: 'Rewards' };

export default function Page() {
  return <PortalRewardsPage />;
}
