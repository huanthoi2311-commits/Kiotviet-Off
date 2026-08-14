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

    // T051.09 — mock the REAL response shape: every 2xx body is wrapped by the backend's
    // TransformInterceptor into { success, data, meta, traceId, timestamp } (T051.08A envelope
    // class). Previously this mock returned the entity directly, unwrapped — which meant the
    // hook's own former bug (returning `response.data`, the whole envelope, instead of
    // `response.data.data`) went undetected: the test's fake response happened to already be
    // shaped like the entity, masking exactly the mismatch this test exists to catch.
    server.use(
      http.get(`${API_BASE_URL}/organizations/current`, () =>
        HttpResponse.json({
          success: true,
          data: { id: 'org-42', name: 'KiotViet Off', slug: 'kiotviet-off' },
          meta: null,
          traceId: 't-1',
          timestamp: new Date().toISOString(),
        }),
      ),
    );

    const { result } = renderHook(() => useCurrentOrganization(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Regression proof: the cached value is the unwrapped entity, not the envelope — `success`/
    // `meta`/`traceId` must NOT leak into the query's data.
    expect(result.current.data).toEqual({
      id: 'org-42',
      name: 'KiotViet Off',
      slug: 'kiotviet-off',
    });
  });

  it('does not fetch when unauthenticated', () => {
    const { result } = renderHook(() => useCurrentOrganization(), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
