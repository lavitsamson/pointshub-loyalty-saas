import type { Metadata } from 'next';
import { AuditLogPage } from '@/features/audit/audit-log-page';

export const metadata: Metadata = { title: 'Audit log' };

export default function Page() {
  return <AuditLogPage />;
}
