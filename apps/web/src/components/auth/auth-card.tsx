import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';

/** The card every sign-in style page uses; its title is the page's h1. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <h1 className="text-xl font-semibold">{title}</h1>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
    </div>
  );
}
