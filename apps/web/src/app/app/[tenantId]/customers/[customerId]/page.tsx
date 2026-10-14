import type { Metadata } from 'next';
import { CustomerDetailPage } from '@/features/customers/customer-detail-page';

export const metadata: Metadata = { title: 'Customer' };

export default function Page() {
  return <CustomerDetailPage />;
}
