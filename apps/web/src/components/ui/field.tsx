import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps {
  id: string;
  label: ReactNode;
  error?: string | undefined;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Label, control, hint and error for one form field. Pair it with `describedBy(id, error)`
 * on the control so screen readers announce the hint and the error with it.
 */
export function Field({ id, label, error, hint, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Accessibility attributes linking a control to its Field's hint or error. */
export function describedBy(id: string, error?: string, hasHint = false) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hasHint ? `${id}-hint` : undefined,
  } as const;
}
