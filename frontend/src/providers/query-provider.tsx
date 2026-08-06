'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { isNormalizedError } from '@/services/api-client';

/**
 * Global error surfacing to the Toast system (SPEC-T031 §20): the single
 * integration point between TanStack Query and the Toast component — no
 * calling code parses `error.response.data` itself (FR9). `error` here is
 * already a `NormalizedError` (apiClient's interceptor normalized it
 * before rejecting) — never re-normalize it.
 */
function reportQueryError(error: unknown) {
  toast.error(isNormalizedError(error) ? error.message : 'Đã xảy ra lỗi không xác định');
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
        queryCache: new QueryCache({ onError: reportQueryError }),
        mutationCache: new MutationCache({ onError: reportQueryError }),
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
