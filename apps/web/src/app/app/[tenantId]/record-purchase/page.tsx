import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RecordPurchasePage } from '@/features/purchases/record-purchase-page';

export const metadata: Metadata = { title: 'Record purchase' };

export default function Page() {
  return (
    <Suspense>
      <RecordPurchasePage />
    </Suspense>
  );
}
