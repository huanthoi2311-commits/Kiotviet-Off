import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/mocks/server';
import { buildAccessToken } from '@/test/build-access-token';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient } from './api-client';
import { CHANNEL_NAME } from './auth-coordination';

const API_BASE_URL = 'http://localhost:3000/api/v1';

describe('apiClient 401 handling (FR3, §9)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    window.localStorage.clear();
  });

  it('refresh success: retries the original request once with the new token', async () => {
    const oldToken = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    const newToken = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['a:read'],
    });
    useAuthStore.getState().setAccessToken(oldToken);

    let protectedCallCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/protected/resource`, ({ request }) => {
        protectedCallCount += 1;
        const auth = request.headers.get('authorization');
        if (auth === `Bearer ${oldToken}`) {
          return HttpResponse.json(
            { success: false, code: 'UNAUTHORIZED', message: 'Token expired' },
            { status: 401 },
          );
        }
        return HttpResponse.json({ ok: true, sawAuth: auth });
      }),
      http.post(`${API_BASE_URL}/auth/refresh`, () => HttpResponse.json({ accessToken: newToken })),
    );

    const response = await apiClient.get('/protected/resource');

    expect(response.data).toEqual({ ok: true, sawAuth: `Bearer ${newToken}` });
    expect(protectedCallCount).toBe(2);
    expect(useAuthStore.getState().accessToken).toBe(newToken);
  });

  it('refresh failure: rejects with the original error, clears the session, and broadcasts logout (§9 steps 5-6)', async () => {
    const oldToken = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    useAuthStore.getState().setAccessToken(oldToken);

    // BroadcastChannel never delivers to the sending instance — an independent channel
    // instance with the same name simulates a second tab observing the broadcast.
    const observerChannel = new BroadcastChannel(CHANNEL_NAME);
    const receivedMessages: string[] = [];
    observerChannel.addEventListener('message', (event: MessageEvent<{ type: string }>) => {
      receivedMessages.push(event.data.type);
    });

    server.use(
      http.get(`${API_BASE_URL}/protected/resource`, () =>
        HttpResponse.json(
          { success: false, code: 'UNAUTHORIZED', message: 'Token expired' },
          { status: 401 },
        ),
      ),
      http.post(`${API_BASE_URL}/auth/refresh`, () =>
        HttpResponse.json(
          { success: false, code: 'AUTH_005', message: 'Refresh token đã hết hạn' },
          { status: 401 },
        ),
      ),
    );

    await expect(apiClient.get('/protected/resource')).rejects.toMatchObject({
      kind: 'api-error',
      message: 'Token expired',
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
    await vi.waitFor(() => expect(receivedMessages).toContain('logout'));

    observerChannel.close();
  });

  it('does not attempt a refresh for a 401 from /auth/login itself', async () => {
    let refreshCallCount = 0;
    server.use(
      http.post(`${API_BASE_URL}/auth/login`, () =>
        HttpResponse.json(
          { success: false, code: 'AUTH_001', message: 'Sai thông tin đăng nhập' },
          { status: 401 },
        ),
      ),
      http.post(`${API_BASE_URL}/auth/refresh`, () => {
        refreshCallCount += 1;
        return HttpResponse.json({ accessToken: 'irrelevant' });
      }),
    );

    await expect(apiClient.post('/auth/login', {})).rejects.toMatchObject({
      kind: 'api-error',
      message: 'Sai thông tin đăng nhập',
    });
    expect(refreshCallCount).toBe(0);
  });
});
