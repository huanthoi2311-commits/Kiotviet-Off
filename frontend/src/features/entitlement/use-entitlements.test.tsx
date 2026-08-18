import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { useEntitlements } from './use-entitlements';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function renderUseEntitlements() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useEntitlements(), { wrapper });
}

describe('useEntitlements (T053.03 — Current Entitlement Context Defect fix)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('resolves effectiveFeatures from GET /entitlements/current for an authenticated user', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: [],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/entitlements/current`, () =>
        HttpResponse.json(
          envelope({ effectiveFeatures: ['DASHBOARD', 'USER_MANAGEMENT', 'RBAC_MANAGEMENT'] }),
        ),
      ),
    );

    const { result } = renderUseEntitlements();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasFeature('USER_MANAGEMENT')).toBe(true);
    expect(result.current.hasFeature('SUPPLIER')).toBe(false);
    expect(result.current.effectiveFeatures).toEqual(
      expect.arrayContaining(['DASHBOARD', 'USER_MANAGEMENT', 'RBAC_MANAGEMENT']),
    );
  });

  // Critical regression (Architect Decision) — a user WITHOUT organization:view (indeed, with no
  // permissions at all) must still resolve their Organization's real effective features. The old
  // design gated the query on organization:view and silently failed closed for everyone else,
  // regardless of what their plan actually included — that coupling is now removed entirely.
  it('resolves real effective features for a user WITHOUT organization:view (no permission gate anymore)', async () => {
    const token = buildAccessToken({
      sub: 'user-2',
      organizationId: 'org-1',
      permissions: ['user:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    let called = false;
    server.use(
      http.get(`${API_BASE_URL}/entitlements/current`, () => {
        called = true;
        return HttpResponse.json(envelope({ effectiveFeatures: ['DASHBOARD', 'USER_MANAGEMENT'] }));
      }),
    );

    const { result } = renderUseEntitlements();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(called).toBe(true);
    expect(result.current.hasFeature('USER_MANAGEMENT')).toBe(true);
  });

  it('does not call the API when unauthenticated — fails closed to no features', async () => {
    let called = false;
    server.use(
      http.get(`${API_BASE_URL}/entitlements/current`, () => {
        called = true;
        return HttpResponse.json(envelope({ effectiveFeatures: ['DASHBOARD'] }));
      }),
    );

    const { result } = renderUseEntitlements();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(called).toBe(false);
    expect(result.current.hasFeature('DASHBOARD')).toBe(false);
    expect(result.current.effectiveFeatures).toEqual([]);
  });
});
