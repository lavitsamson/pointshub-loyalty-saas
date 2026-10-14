'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/components/app/session-gate';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { useLogout } from '@/lib/api/auth';
import { dashboardPath } from '@/lib/navigation';

/** Business picker for people who belong to several; a single membership goes straight in. */
export default function TenantSwitcherPage() {
  const me = useSession();
  const router = useRouter();
  const logout = useLogout();
  const only = me.memberships.length === 1 ? me.memberships[0] : undefined;

  useEffect(() => {
    if (only) router.replace(dashboardPath(only.tenantId));
  }, [only, router]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Logo href="/app" />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            onClick={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })}
          >
            Sign out
          </Button>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-lg flex-1 px-4 pt-10 pb-16">
        <h1 className="text-2xl font-semibold">Choose a business</h1>
        <p className="mt-1 text-sm text-muted-foreground">Signed in as {me.user.email}</p>

        {me.memberships.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="You are not part of any business yet"
              description="Ask an owner or admin to invite you, or create your own business account."
              action={
                <Button asChild variant="outline">
                  <Link href="/register">Create a business</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {me.memberships.map((m) => (
              <li key={m.tenantId}>
                <Card className="transition-colors hover:bg-muted">
                  <Link
                    href={dashboardPath(m.tenantId)}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <span>
                      <span className="block font-medium">{m.tenantName}</span>
                      <span className="text-sm text-muted-foreground capitalize">
                        {m.role.toLowerCase()}
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
