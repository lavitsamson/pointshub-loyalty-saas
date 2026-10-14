import { toast } from '@/components/ui/toast';
import { errorMessage } from './api/client';

type ToastInput = Parameters<typeof toast>[0];

/**
 * Reports a mutation's outcome in a toast. Takes the promise from `mutateAsync` because an
 * action that removes its own row (delete, fulfil, leave) unmounts the button that started
 * it, and TanStack Query skips per-call `mutate` callbacks for unmounted components.
 */
export async function notify<T>(
  action: Promise<T>,
  messages: { success?: (result: T) => ToastInput; failure: string },
): Promise<T | undefined> {
  try {
    const result = await action;
    if (messages.success) toast(messages.success(result));
    return result;
  } catch (error) {
    toast({ title: messages.failure, description: errorMessage(error), variant: 'destructive' });
    return undefined;
  }
}
