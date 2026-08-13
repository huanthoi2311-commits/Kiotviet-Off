import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/mocks/server';
import { buildAccessToken } from '@/test/build-access-token';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient, apiClientMutator, refreshAccessToken } from './api-client';
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

  it('coordination timeout: preserves session state and does not broadcast logout (T031.08A)', async () => {
    const oldToken = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    useAuthStore.getState().setAccessToken(oldToken);

    // Simulate another tab already holding the mutex — requestCoordinatedRefresh
    // will queue behind it and, once released, find a completed generation whose
    // broadcast never arrives (the exact case T031.08A closes).
    window.localStorage.setItem(
      'pos-erp-auth-refresh-mutex',
      JSON.stringify({ holderId: 'tab-a-holder', startedAt: Date.now() }),
    );

    server.use(
      http.get(`${API_BASE_URL}/protected/resource`, () =>
        HttpResponse.json(
          { success: false, code: 'UNAUTHORIZED', message: 'Token expired' },
          { status: 401 },
        ),
      ),
    );

    const observerChannel = new BroadcastChannel(CHANNEL_NAME);
    const receivedMessages: string[] = [];
    observerChannel.addEventListener('message', (event: MessageEvent<{ type: string }>) => {
      receivedMessages.push(event.data.type);
    });

    const resultPromise = apiClient.get('/protected/resource');
    const settlement = resultPromise.then(
      (value) => ({ status: 'fulfilled' as const, value }),
      (error: unknown) => ({ status: 'rejected' as const, error }),
    );

    // Real timers here: let the 401 response, the interceptor, and
    // requestCoordinatedRefresh's own generation/mutex capture all settle before
    // simulating "Tab A" — otherwise this write could race ahead of that capture
    // and be observed as "nothing changed", silently defeating the whole test.
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Only now switch to fake timers, to bound the 5s broadcast-wait deterministically.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    // "Tab A" completes, but its broadcast is never delivered in this test.
    window.localStorage.setItem(
      'pos-erp-auth-refresh-generation',
      JSON.stringify({ id: 'tab-a-generation', status: 'completed', completedAt: Date.now() }),
    );
    window.localStorage.removeItem('pos-erp-auth-refresh-mutex');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'pos-erp-auth-refresh-mutex', newValue: null }),
    );

    await vi.advanceTimersByTimeAsync(5_100);
    vi.useRealTimers();

    const outcome = await settlement;
    expect(outcome.status).toBe('rejected');

    // Session state preserved — the backend never told us anything is wrong, so the
    // (stale-but-not-confirmed-invalid) token stays, and no logout is broadcast.
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe(oldToken);
    expect(receivedMessages).not.toContain('logout');

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
        return HttpResponse.json({
          success: true,
          data: { accessToken: 'irrelevant' },
          meta: null,
          traceId: 't-1',
          timestamp: new Date().toISOString(),
        });
      }),
    );

    await expect(apiClient.post('/auth/login', {})).rejects.toMatchObject({
      kind: 'api-error',
      message: 'Sai thông tin đăng nhập',
    });
    expect(refreshCallCount).toBe(0);
  });
});

describe('apiClientMutator (T032.03 — envelope double-unwrap)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    window.localStorage.clear();
  });

  it('unwraps the backend TransformInterceptor envelope, returning only the inner data payload', async () => {
    const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/widgets/1`, () =>
        HttpResponse.json({
          success: true,
          data: { id: '1', name: 'Widget' },
          meta: null,
          traceId: 'trace-1',
          timestamp: new Date().toISOString(),
        }),
      ),
    );

    const result = await apiClientMutator<{ id: string; name: string }>({
      url: '/widgets/1',
      method: 'GET',
    });

    expect(result).toEqual({ id: '1', name: 'Widget' });
  });

  it(
    "strips a leading '/api/v1' from Orval-generated URLs instead of doubling apiClient's own baseURL " +
      '(T035.10 — every generated call embeds the full OpenAPI path; not caught until a real page ' +
      'first wired a generated hook in, since the drift-check only regenerates + typechecks)',
    async () => {
      server.use(
        http.get(`${API_BASE_URL}/widgets/1`, () =>
          HttpResponse.json({
            success: true,
            data: { id: '1', name: 'Widget' },
            meta: null,
            traceId: 'trace-1',
            timestamp: new Date().toISOString(),
          }),
        ),
      );

      const result = await apiClientMutator<{ id: string; name: string }>({
        url: '/api/v1/widgets/1',
        method: 'GET',
      });

      expect(result).toEqual({ id: '1', name: 'Widget' });
    },
  );

  it("leaves a URL with no '/api/v1' prefix unchanged (only the '/api/v1'-prefixed shape generated calls actually use is stripped)", async () => {
    server.use(
      http.get(`${API_BASE_URL}/health`, () =>
        HttpResponse.json({
          success: true,
          data: { status: 'ok' },
          meta: null,
          traceId: 'trace-1',
          timestamp: new Date().toISOString(),
        }),
      ),
    );

    const result = await apiClientMutator<{ status: string }>({ url: '/health', method: 'GET' });

    expect(result).toEqual({ status: 'ok' });
  });
});

/**
 * T051.08A — `refreshAccessToken()` bypasses `apiClient` (raw `axios.post`, see the function's own
 * doc comment) and used to type `response.data` directly as `{ accessToken }`, when the real
 * backend wraps every 2xx body in `{ success, data, meta, traceId, timestamp }`. Focused, isolated
 * coverage of the unwrap itself — the interceptor-level 401-retry tests above already prove the
 * surrounding coordination/retry flow stays intact with the corrected mock shape.
 */
describe('refreshAccessToken (T051.08A)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('unwraps the nested accessToken out of the real success envelope and stores it', async () => {
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

    const result = await refreshAccessToken();

    expect(result).toBe(newToken);
    expect(useAuthStore.getState().accessToken).toBe(newToken);
  });

  it('fails with a diagnosable normalized error instead of storing an undefined accessToken', async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/refresh`, () =>
        HttpResponse.json({
          success: true,
          data: {},
          meta: null,
          traceId: 't-1',
          timestamp: new Date().toISOString(),
        }),
      ),
    );

    await expect(refreshAccessToken()).rejects.toMatchObject({
      kind: 'api-error',
      code: 'MALFORMED_AUTH_RESPONSE',
    });
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
