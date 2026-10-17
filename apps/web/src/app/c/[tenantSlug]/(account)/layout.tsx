import type { ReactNode } from 'react';
import { CustomerGate } from '@/features/portal/portal-shell';

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <CustomerGate>{children}</CustomerGate>;
}
