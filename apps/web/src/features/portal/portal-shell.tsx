'use client';

import type { PortalMe } from '@pointshub/shared';
import { Gift, History, Home, LogOut, Ticket, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { errorMessage, isApiError } from '@/lib/api/client';
import { usePortalBusiness, usePortalLogout, usePortalMe } from '@/lib/api/portal';
import { cn } from '@/lib/utils';

export function usePortalSlug(): string {
  return useParams<{ tenantSlug: string }>().tenantSlug;
}

/** Path of a portal page, e.g. portalHref('bean', 'rewards') → /c/bean/rewards. */
export const portalHref = (slug: string, page = '') => `/c/${slug}${page ? `/${page}` : ''}`;

/**
 * Every portal page: the business's name in the header and, for an unknown slug, a
 * not-found page instead of the content. Mobile-first: one narrow column at every size.
 */
export function PortalShell({ children }: { children: ReactNode }) {
  const slug = usePortalSlug();
  const business = usePortalBusiness(slug);
  const me = usePortalMe(slug);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-4">
          {business.data ? (
            <Link href={portalHref(slug)} className="truncate font-semibold tracking-tight">
              {business.data.name}
            </Link>
          ) : business.isPending ? (
            <Skeleton className="h-5 w-40" />
          ) : (
            <span className="font-semibold">Rewards</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            {me.data && <SignOutButton />}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        {isApiError(business.error, 404) ? (
          <EmptyState
            title="Business not found"
            description="Check the link you were given, or ask the business for their rewards page."
          />
        ) : business.isError ? (
          <ErrorState
            message={errorMessage(business.error)}
            onRetry={() => void business.refetch()}
          />
        ) : (
          children
        )}
      </main>
      <footer className="py-6 text-center text-xs text-muted-foreground">
        Rewards powered by{' '}
        <Link href="/" className="underline">
          PointsHub
        </Link>
      </footer>
    </div>
  );
}

function SignOutButton() {
  const slug = usePortalSlug();
  const logout = usePortalLogout(slug);
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={logout.isPending}
      onClick={() =>
        logout.mutate(undefined, { onSettled: () => router.replace(portalHref(slug, 'login')) })
      }
    >
      <LogOut aria-hidden /> Sign out
    </Button>
  );
}

const AccountContext = createContext<PortalMe | null>(null);

/** The signed-in customer. Only usable below <CustomerGate>. */
export function usePortalAccount(): PortalMe {
  const me = useContext(AccountContext);
  if (!me) throw new Error('usePortalAccount must be used inside <CustomerGate>');
  return me;
}

/**
 * Renders the customer's pages only with a session for this portal, otherwise sends them to
 * its sign-in page and back afterwards. The API remains the real gatekeeper.
 */
export function CustomerGate({ children }: { children: ReactNode }) {
  const slug = usePortalSlug();
  const me = usePortalMe(slug);
  const router = useRouter();
  const pathname = usePathname();
  const signedOut = me.isSuccess && me.data === null;

  useEffect(() => {
    if (signedOut) {
      router.replace(`${portalHref(slug, 'login')}?next=${encodeURIComponent(pathname)}`);
    }
  }, [signedOut, router, pathname, slug]);

  if (me.isError) {
    return <ErrorState message={errorMessage(me.error)} onRetry={() => void me.refetch()} />;
  }
  if (!me.data) {
    return (
      <div role="status" aria-label="Loading your account" className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  return (
    <AccountContext.Provider value={me.data}>
      <AccountNav />
      {children}
    </AccountContext.Provider>
  );
}

const TABS: Array<{ page: string; label: string; icon: LucideIcon }> = [
  { page: '', label: 'Home', icon: Home },
  { page: 'rewards', label: 'Rewards', icon: Gift },
  { page: 'activity', label: 'Activity', icon: History },
  { page: 'redemptions', label: 'My codes', icon: Ticket },
];

function AccountNav() {
  const slug = usePortalSlug();
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="mb-6">
      <ul className="grid grid-cols-4 gap-1 rounded-lg border bg-card p-1">
        {TABS.map((tab) => {
          const href = portalHref(slug, tab.page);
          const active = pathname === href;
          return (
            <li key={tab.label}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-md px-1 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex-row sm:justify-center sm:gap-2 sm:text-sm',
                  active && 'bg-secondary text-secondary-foreground hover:bg-secondary',
                )}
              >
                <tab.icon className="size-4" aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
