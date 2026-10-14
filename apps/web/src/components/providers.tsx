'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { type ReactNode, useState } from 'react';
import { Toaster } from '@/components/ui/toast';
import { isApiError } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';

function createQueryClient(): QueryClient {
  // A 401 that survived the client's refresh attempt means the session is over: clearing the
  // cached user makes the app shell redirect to the login page.
  const onError = (error: unknown) => {
    if (isApiError(error, 401)) queryClient.setQueryData(keys.me, null);
  };
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        refetchOnWindowFocus: false,
        // Client errors will not fix themselves; only retry network and server failures.
        retry: (failureCount, error) =>
          failureCount < 2 && !(isApiError(error) && error.status < 500),
      },
      // Never retry writes automatically: points must not move twice.
      mutations: { retry: false },
    },
  });
  return queryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
