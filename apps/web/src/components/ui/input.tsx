import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const fieldClasses =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn('h-9', fieldClasses, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn('min-h-20', fieldClasses, className)} {...props} />;
}

/** A styled native <select>: keyboard and screen-reader behaviour comes for free. */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn('h-9 pr-8', fieldClasses, className)} {...props} />;
}

export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      className={cn('size-4 rounded border-input accent-primary', className)}
      {...props}
    />
  );
}
