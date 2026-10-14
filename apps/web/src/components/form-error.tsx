import { Alert } from '@/components/ui/feedback';
import { formError } from '@/lib/api/client';

/** A failed submission's message above the form; nothing for field-level validation errors. */
export function FormError({ error }: { error: unknown }) {
  const message = formError(error);
  return message ? <Alert variant="destructive">{message}</Alert> : null;
}
