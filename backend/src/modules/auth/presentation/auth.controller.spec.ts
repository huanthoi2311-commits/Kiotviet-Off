import type { Request, Response } from 'express';
import { AuthService, IssuedSession } from '../application/auth.service';
import { ForgotPasswordService } from '../application/forgot-password.service';
import { AuthController } from './auth.controller';

/**
 * T051.08B — cookie `refresh_token` phải dùng `secure` lấy từ `auth.cookieSecure`
 * (`ConfigService`), KHÔNG BAO GIỜ tự đọc `process.env.NODE_ENV` trực tiếp nữa (đó chính là bug
 * đã chặn đăng nhập qua browser thật trên gói triển khai HTTP localhost — xem T051.08B).
 *
 * T051.08C — `path` phải là `'/'`, KHÔNG được hẹp về `/api/v1/auth`: middleware.ts (frontend) đọc
 * cookie này trên các route TRANG (`/dashboard`, ...), không phải trên `/api/v1/auth/...` — path
 * hẹp khiến trình duyệt không bao giờ gửi cookie tới middleware, bất kể `secure`/`sameSite`/
 * `httpOnly` đúng cỡ nào (xác nhận qua real-browser E2E T051.08: đăng nhập 200, accessToken parse
 * đúng, nhưng `router.replace('/dashboard')` luôn bị middleware bật lại `/login`).
 *
 * `login`, `refresh` (cùng đi qua `deliver()`), `logout`, `logout-all` (cùng đi qua
 * `cookieAttributes()`) PHẢI dùng chung đúng 1 giá trị `secure`/`sameSite`/`path`/`httpOnly` —
 * không được lệch nhau.
 */
describe('AuthController — cookie transport (T051.08B/T051.08C)', () => {
  let authService: jest.Mocked<
    Pick<AuthService, 'login' | 'refreshToken' | 'logout' | 'logoutAll'>
  >;
  let forgotPasswordService: jest.Mocked<
    Pick<ForgotPasswordService, 'requestOtp' | 'verifyOtp' | 'resetPassword'>
  >;
  let configGet: jest.Mock;

  const issued: IssuedSession = {
    response: {
      accessToken: 'access-token',
      userInfo: {
        id: 'user-1',
        email: 'a@b.com',
        username: 'a',
        organizationId: 'org-1',
        branchId: null,
        permissions: [],
      },
    },
    refreshTokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
  };
  // deliver() reads `issued.response.refreshToken` to set the cookie value — Web login response
  // itself never includes it (only Mobile does), but the ISSUED session domain object always has
  // it (the raw token to embed in the cookie, distinct from what's returned in the HTTP body).
  const issuedWithRefreshToken = {
    ...issued,
    response: { ...issued.response, refreshToken: 'raw-refresh-token' },
  } as IssuedSession;

  function buildController(cookieSecure: boolean | undefined) {
    authService = {
      login: jest.fn().mockResolvedValue(issuedWithRefreshToken),
      refreshToken: jest.fn().mockResolvedValue(issuedWithRefreshToken),
      logout: jest.fn().mockResolvedValue(undefined),
      logoutAll: jest.fn().mockResolvedValue(undefined),
    };
    forgotPasswordService = {
      requestOtp: jest.fn(),
      verifyOtp: jest.fn(),
      resetPassword: jest.fn(),
    };
    configGet = jest.fn().mockReturnValue(cookieSecure);

    const controller = new AuthController(
      authService as unknown as AuthService,
      forgotPasswordService as unknown as ForgotPasswordService,
      { get: configGet } as never,
    );
    return controller;
  }

  function fakeRequest(overrides: Partial<Request> = {}): Request {
    return {
      headers: {},
      ip: '127.0.0.1',
      cookies: {},
      ...overrides,
    } as unknown as Request;
  }

  function fakeResponse(): jest.Mocked<
    Pick<Response, 'cookie' | 'clearCookie'>
  > {
    return { cookie: jest.fn(), clearCookie: jest.fn() } as never;
  }

  describe('login() — sets refresh_token with cookieSecure from config', () => {
    it('AUTH_COOKIE_SECURE=false (packaged HTTP topology) → Secure=false', async () => {
      const controller = buildController(false);
      const res = fakeResponse();

      await controller.login(
        { organizationSlug: 'org', email: 'a@b.com', password: 'password123' },
        fakeRequest(),
        res as unknown as Response,
      );

      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'raw-refresh-token',
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/',
        }),
      );
    });

    it('AUTH_COOKIE_SECURE=true (HTTPS topology) → Secure=true', async () => {
      const controller = buildController(true);
      const res = fakeResponse();

      await controller.login(
        { organizationSlug: 'org', email: 'a@b.com', password: 'password123' },
        fakeRequest(),
        res as unknown as Response,
      );

      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'raw-refresh-token',
        expect.objectContaining({ secure: true }),
      );
    });

    it('config returns undefined (defensive) → fails secure, Secure=true', async () => {
      const controller = buildController(undefined);
      const res = fakeResponse();

      await controller.login(
        { organizationSlug: 'org', email: 'a@b.com', password: 'password123' },
        fakeRequest(),
        res as unknown as Response,
      );

      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'raw-refresh-token',
        expect.objectContaining({ secure: true }),
      );
    });
  });

  describe('refresh() — shares the exact same cookieAttributes() as login()', () => {
    it('AUTH_COOKIE_SECURE=false → Secure=false, same attributes as login', async () => {
      const controller = buildController(false);
      const res = fakeResponse();

      await controller.refresh(
        {},
        fakeRequest({ cookies: { refresh_token: 'old-token' } }),
        res as unknown as Response,
      );

      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'raw-refresh-token',
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/',
        }),
      );
    });
  });

  describe('logout()/logout-all() — clearCookie uses the SAME attributes as the create path', () => {
    const user = {
      sub: 'user-1',
      organizationId: 'org-1',
      branchId: null,
      permissions: [],
      permissionVersion: 1,
      email: 'a@b.com',
      isPlatformAdmin: false,
    };

    it('logout(): AUTH_COOKIE_SECURE=false → clearCookie called with secure=false (matching create)', async () => {
      const controller = buildController(false);
      const res = fakeResponse();

      await controller.logout(
        {},
        user,
        fakeRequest(),
        res as unknown as Response,
      );

      expect(res.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/',
        }),
      );
    });

    it('logout(): AUTH_COOKIE_SECURE=true → clearCookie called with secure=true (matching create)', async () => {
      const controller = buildController(true);
      const res = fakeResponse();

      await controller.logout(
        {},
        user,
        fakeRequest(),
        res as unknown as Response,
      );

      expect(res.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.objectContaining({ secure: true }),
      );
    });

    it('logoutAll(): clearCookie uses the same shared attributes helper as logout()', async () => {
      const controller = buildController(false);
      const res = fakeResponse();

      await controller.logoutAll(
        user,
        fakeRequest(),
        res as unknown as Response,
      );

      expect(res.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/',
        }),
      );
    });
  });
});
