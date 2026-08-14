import { useQuery } from '@tanstack/react-query';
import { apiClient, type ApiSuccessEnvelope } from '@/services/api-client';
import { useAuthStore } from '@/stores/auth-store';

export interface CurrentOrganization {
  id: string;
  name: string;
  slug: string;
  [key: string]: unknown;
}

const CURRENT_ORGANIZATION_QUERY_KEY = ['organizations', 'current'] as const;

/**
 * Full settings/subscription detail (SPEC-T031 FR7b) — server state, kept in
 * TanStack Query rather than a Zustand store (§15). Superseded by the
 * Orval-generated equivalent once `docs/api/openapi.json` exists (§13).
 *
 * T051.09 — same envelope-unwrap bug class as T051.08A (login/refresh): the backend's
 * `TransformInterceptor` wraps every 2xx body into `ApiSuccessEnvelope<T>`, so `response.data` is
 * the WHOLE envelope, never the entity directly. Previously typed `response.data` as
 * `CurrentOrganization` and returned it unwrapped — latent (the sole caller, `dashboard-shell.tsx`,
 * discards the return value), but proven-wrong transport handling that would silently hand any
 * future consumer the envelope object instead of the organization (`.id`/`.name`/`.slug` all
 * `undefined` at runtime despite typing as `string`). Fixed to the same `ApiSuccessEnvelope<T>` +
 * `response.data.data` pattern already established in `auth-actions.ts`/`api-client.ts`.
 */
export function useCurrentOrganization() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: CURRENT_ORGANIZATION_QUERY_KEY,
    queryFn: async () => {
      const response =
        await apiClient.get<ApiSuccessEnvelope<CurrentOrganization>>('/organizations/current');
      return response.data.data;
    },
    enabled: isAuthenticated,
  });
}

/** Synchronous `organizationId` derived from the decoded access token (SPEC-T031 FR7a). */
export function useOrganizationId(): string | undefined {
  return useAuthStore((state) => state.claims?.organizationId);
}
