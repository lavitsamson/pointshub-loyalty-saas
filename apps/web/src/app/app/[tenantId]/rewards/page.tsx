import type { Metadata } from 'next';
import { RewardsPage } from '@/features/rewards/rewards-page';

export const metadata: Metadata = { title: 'Rewards' };

export default function Page() {
  return <RewardsPage />;
}
