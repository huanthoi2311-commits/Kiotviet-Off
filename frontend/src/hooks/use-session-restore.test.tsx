import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
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
      http.post(`${API_BASE_URL}/auth/refresh`, () => HttpResponse.json({ accessToken: newToken })),
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

  it('returns "restored" immediately, with no refresh call, when a token is already held', () => {
    const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    useAuthStore.getState().setAccessToken(token);

    let refreshCallCount = 0;
    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, () => {
        refreshCallCount += 1;
        return HttpResponse.json({ accessToken: 'irrelevant' });
      }),
    );

    const { result } = renderHook(() => useSessionRestore());

    expect(result.current).toBe('restored');
    expect(refreshCallCount).toBe(0);
  });
});
