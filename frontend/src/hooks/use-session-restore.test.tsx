import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { useSessionRestore } from './use-session-restore';

const API_BASE_URL = 'http://localhost:3000/api/v1';

describe('useSessionRestore (FR2, §9 step 2)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    window.localStorage.clear();
  });

  it('restores the session via a coordinated refresh when no token is held', async () => {
    const newToken = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, () =>
        HttpResponse.json({
          success: true,
          data: { accessToken: newToken },
          meta: null,
          traceId: 't-1',
          timestamp: new Date().toISOString(),
        }),
      ),
    );

    const { result } = renderHook(() => useSessionRestore());

    expect(result.current).toBe('restoring');

    await waitFor(() => expect(result.current).toBe('restored'));
    expect(useAuthStore.getState().accessToken).toBe(newToken);
  });

  it('reports unauthenticated when the refresh call fails', async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, () =>
        HttpResponse.json(
          { success: false, code: 'AUTH_003', message: 'Refresh token không hợp lệ' },
          { status: 401 },
        ),
      ),
    );

    const { result } = renderHook(() => useSessionRestore());

    await waitFor(() => expect(result.current).toBe('unauthenticated'));
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('reports restore-error (not unauthenticated) when cross-tab coordination times out, and does not restore a stale token (T031.08A)', async () => {
    // Simulate another tab already holding the mutex — the effect below will queue
    // behind it and, once released, find a completed generation whose broadcast
    // never arrives (the exact case T031.08A closes).
    window.localStorage.setItem(
      'pos-erp-auth-refresh-mutex',
      JSON.stringify({ holderId: 'tab-a-holder', startedAt: Date.now() }),
    );

    const { result } = renderHook(() => useSessionRestore());
    expect(result.current).toBe('restoring');

    // Real timers: let the effect run and enter the mutex wait before simulating
    // "Tab A" — otherwise this write could race ahead of that capture.
    await new Promise((resolve) => setTimeout(resolve, 20));

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    window.localStorage.setItem(
      'pos-erp-auth-refresh-generation',
      JSON.stringify({ id: 'tab-a-generation', status: 'completed', completedAt: Date.now() }),
    );
    window.localStorage.removeItem('pos-erp-auth-refresh-mutex');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'pos-erp-auth-refresh-mutex', newValue: null }),
    );

    await act(() => vi.advanceTimersByTimeAsync(5_100));
    vi.useRealTimers();

    await waitFor(() => expect(result.current).toBe('restore-error'));
    // Not logged out — the backend never reported anything wrong, and no stale
    // token was restored either.
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('returns "restored" immediately, with no refresh call, when a token is already held', () => {
    const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    useAuthStore.getState().setAccessToken(token);

    let refreshCallCount = 0;
    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, () => {
        refreshCallCount += 1;
        return HttpResponse.json({
          success: true,
          data: { accessToken: 'irrelevant' },
          meta: null,
          traceId: 't-1',
          timestamp: new Date().toISOString(),
        });
      }),
    );

    const { result } = renderHook(() => useSessionRestore());

    expect(result.current).toBe('restored');
    expect(refreshCallCount).toBe(0);
  });
});
