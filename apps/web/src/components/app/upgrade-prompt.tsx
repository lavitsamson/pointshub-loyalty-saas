'use client';

import { Permission } from '@pointshub/shared';
import Link from 'next/link';
import { useTenant } from '@/components/app/tenant-context';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { isPlanLimit } from '@/lib/api/billing';

/**
 * A form's error, where a plan limit (402) comes with the way out: a link to the plans for
 * the owner, who alone can upgrade, and a pointer to them for everyone else.
 */
export function FormErrorWithUpgrade({ error }: { error: unknown }) {
  const tenant = useTenant();
  if (!isPlanLimit(error)) return <FormError error={error} />;

  return (
    <Alert variant="destructive">
      <p>{error.problem.detail}</p>
      {tenant.can(Permission.ManageBilling) ? (
        <Button asChild size="sm" className="mt-2">
          <Link href={`/app/${tenant.tenantId}/billing`}>See plans</Link>
        </Button>
      ) : (
        <p className="mt-1 text-muted-foreground">Ask the business owner to upgrade.</p>
      )}
    </Alert>
  );
}
