import type { Metadata } from 'next';
import { RedemptionsPage } from '@/features/redemptions/redemptions-page';

export const metadata: Metadata = { title: 'Redemptions' };

export default function Page() {
  return <RedemptionsPage />;
}
