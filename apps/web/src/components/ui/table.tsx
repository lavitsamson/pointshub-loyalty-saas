import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader(props: ComponentProps<'thead'>) {
  return <thead className="border-b" {...props} />;
}

export function TableBody(props: ComponentProps<'tbody'>) {
  return <tbody className="[&_tr:last-child]:border-0" {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn('border-b transition-colors data-[state=selected]:bg-muted', className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-3 py-2.5 align-middle', className)} {...props} />;
}
