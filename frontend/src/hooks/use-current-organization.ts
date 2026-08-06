import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/api-client';
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
 */
export function useCurrentOrganization() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: CURRENT_ORGANIZATION_QUERY_KEY,
    queryFn: async () => {
      const response = await apiClient.get<CurrentOrganization>('/organizations/current');
      return response.data;
    },
    enabled: isAuthenticated,
  });
}

/** Synchronous `organizationId` derived from the decoded access token (SPEC-T031 FR7a). */
export function useOrganizationId(): string | undefined {
  return useAuthStore((state) => state.claims?.organizationId);
}
