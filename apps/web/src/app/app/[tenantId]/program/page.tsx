import type { Metadata } from 'next';
import { ProgramPage } from '@/features/program/program-page';

export const metadata: Metadata = { title: 'Programme' };

export default function Page() {
  return <ProgramPage />;
}
