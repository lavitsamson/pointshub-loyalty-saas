import { AlertCircle, Inbox } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

/** Placeholder rows while a list or page loads; announced once to screen readers. */
export function LoadingRows({ rows = 5, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function Alert({
  variant = 'default',
  className,
  children,
  ...props
}: ComponentProps<'div'> & { variant?: 'default' | 'destructive' | 'success' }) {
  return (
    <div
      role={variant === 'destructive' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm',
        variant === 'destructive' && 'border-destructive/50 text-destructive',
        variant === 'success' && 'border-success/50 text-success',
        className,
      )}
      {...props}
    >
      {variant === 'destructive' && <AlertCircle className="mt-0.5 size-4 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
      <Inbox className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 rounded-lg border border-destructive/40 px-6 py-10 text-center"
    >
      <AlertCircle className="size-8 text-destructive" aria-hidden />
      <p className="font-medium">{title}</p>
      {message && <p className="max-w-sm text-sm text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
