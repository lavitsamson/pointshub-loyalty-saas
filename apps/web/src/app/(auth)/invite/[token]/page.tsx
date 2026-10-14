import type { Metadata } from 'next';
import { AcceptInvitation } from '@/components/auth/accept-invitation';

export const metadata: Metadata = { title: 'Join a business' };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptInvitation token={decodeURIComponent(token)} />;
}
