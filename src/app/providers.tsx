'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * TanStack Query defaults, tuned for the providers' published rate limits
 * (spec §10: implement caching, avoid unnecessary requests).
 *
 * - `staleTime` of 5 minutes: none of the upstream feeds update faster than
 *   that, so refetching sooner would spend quota for identical data.
 * - `refetchOnWindowFocus: false`: a dashboard left open on a second monitor
 *   would otherwise refetch every time it is clicked, which is exactly the
 *   pattern OpenAQ's docs warn leads to a ban.
 * - Capped exponential backoff, and no retry on 4xx, which for these APIs
 *   means a bad request or a missing key — retrying cannot fix either.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const status = (error as { status?: number }).status;
          if (status !== undefined && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  // Created in state so each browser session gets exactly one client, and so a
  // server render never shares a cache between requests.
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
