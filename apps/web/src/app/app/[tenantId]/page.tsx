import { redirect } from 'next/navigation';

export default async function TenantIndex({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  redirect(`/app/${tenantId}/dashboard`);
}
