import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { useCurrentOrganization, useOrganizationId } from './use-current-organization';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('organization context (FR7)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('useOrganizationId reads organizationId synchronously from the decoded token (FR7a)', () => {
    const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-42', permissions: [] });
    useAuthStore.getState().setAccessToken(token);

    const { result } = renderHook(() => useOrganizationId());
    expect(result.current).toBe('org-42');
  });

  it('useCurrentOrganization fetches GET /organizations/current when authenticated (FR7b)', async () => {
    const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-42', permissions: [] });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/organizations/current`, () =>
        HttpResponse.json({ id: 'org-42', name: 'KiotViet Off', slug: 'kiotviet-off' }),
      ),
    );

    const { result } = renderHook(() => useCurrentOrganization(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ id: 'org-42', name: 'KiotViet Off' });
  });

  it('does not fetch when unauthenticated', () => {
    const { result } = renderHook(() => useCurrentOrganization(), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
