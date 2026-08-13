import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { buildAccessToken } from '@/test/build-access-token';
import { login } from './auth-actions';

const API_BASE_URL = 'http://localhost:3000/api/v1';

/**
 * T051.08A — `login()` used to type `response.data` directly as `LoginResult`, when the real
 * backend (via the global `TransformInterceptor`) always wraps a 2xx body in
 * `{ success, data, meta, traceId, timestamp }`. Every mock body here MUST use that real envelope
 * shape — a flat `{ accessToken, userInfo }` body is exactly what masked the defect until a real
 * browser hit a real backend (T051.08).
 */
describe('login() — real backend envelope unwrap (T051.08A)', () => {
  it('unwraps the nested accessToken/userInfo out of the real success envelope', async () => {
    const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    const userInfo = {
      id: 'user-1',
      email: 'owner@kiotviet-off.vn',
      username: 'owner',
      organizationId: 'org-1',
      branchId: null,
      permissions: [] as string[],
    };

    server.use(
      http.post(`${API_BASE_URL}/auth/login`, () =>
        HttpResponse.json({
          success: true,
          data: { accessToken: token, userInfo },
          meta: null,
          traceId: 't-1',
          timestamp: new Date().toISOString(),
        }),
      ),
    );

    const result = await login({
      organizationSlug: 'kiotviet-off',
      email: 'owner@kiotviet-off.vn',
      password: 'P@ssw0rd123',
    });

    expect(result).toEqual({ accessToken: token, userInfo });
  });

  it('fails with a diagnosable normalized error instead of returning an undefined accessToken', async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/login`, () =>
        // A 2xx response whose envelope is missing `data.accessToken` — malformed, but not an
        // HTTP error, so it must be caught by the invariant check rather than silently unwrapped
        // into `{ accessToken: undefined }`.
        HttpResponse.json({
          success: true,
          data: { userInfo: null },
          meta: null,
          traceId: 't-1',
          timestamp: new Date().toISOString(),
        }),
      ),
    );

    await expect(
      login({
        organizationSlug: 'kiotviet-off',
        email: 'owner@kiotviet-off.vn',
        password: 'P@ssw0rd123',
      }),
    ).rejects.toMatchObject({
      kind: 'api-error',
      code: 'MALFORMED_AUTH_RESPONSE',
    });
  });
});
