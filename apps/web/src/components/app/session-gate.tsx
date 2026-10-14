'use client';

import type { MeResponse } from '@pointshub/shared';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect } from 'react';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { useMe } from '@/lib/api/auth';
import { errorMessage } from '@/lib/api/client';

const SessionContext = createContext<MeResponse | null>(null);

/** The signed-in user. Only usable below <SessionGate>. */
export function useSession(): MeResponse {
  const me = useContext(SessionContext);
  if (!me) throw new Error('useSession must be used inside <SessionGate>');
  return me;
}

/**
 * Renders its children only for a signed-in user, otherwise sends the visitor to the login
 * page and back here afterwards. The API remains the real gatekeeper: this only decides
 * what to show.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const signedOut = me.isSuccess && me.data === null;

  useEffect(() => {
    if (signedOut) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [signedOut, router, pathname]);

  if (me.isError) {
    return (
      <main id="main" className="mx-auto max-w-md p-6">
        <ErrorState message={errorMessage(me.error)} onRetry={() => void me.refetch()} />
      </main>
    );
  }
  if (!me.data) {
    return (
      <div role="status" aria-label="Loading your account" className="flex min-h-dvh">
        <Skeleton className="hidden w-60 rounded-none md:block" />
        <div className="flex flex-1 flex-col gap-4 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }
  return <SessionContext.Provider value={me.data}>{children}</SessionContext.Provider>;
}
