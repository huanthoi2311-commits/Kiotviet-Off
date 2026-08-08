'use client';

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
  type Mutation,
} from '@tanstack/react-query';
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
export function reportQueryError(error: unknown) {
  toast.error(isNormalizedError(error) ? error.message : 'Đã xảy ra lỗi không xác định');
}

/**
 * T038.08B (SPEC-T038A) — a mutation whose own `onError` already renders
 * the message in-context (a form field, a root alert, an in-dialog Alert)
 * opts out of this global toast via `meta: { suppressGlobalErrorToast: true
 * }`, set at `useMutation()` call time. This cache-level `onError` always
 * runs *before* the mutation's own `onError` (confirmed in
 * @tanstack/query-core's `Mutation.execute()`), so `meta` — known
 * statically before either callback runs — is the only thing this function
 * can check in time; a flag set inside the caller's own `onError` would
 * always arrive too late.
 */
export function reportMutationError(
  error: unknown,
  _variables: unknown,
  _onMutateResult: unknown,
  mutation: Mutation<unknown, unknown, unknown>,
) {
  if (mutation.meta?.suppressGlobalErrorToast) return;
  reportQueryError(error);
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
        mutationCache: new MutationCache({ onError: reportMutationError }),
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
