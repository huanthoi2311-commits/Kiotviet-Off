import { expect, test } from '@playwright/test';

const REFRESH_ENDPOINT = '**/api/v1/auth/refresh';
const ORG_ENDPOINT = '**/api/v1/organizations/current';
const TAB_COUNT = 4;

function fakeAccessToken(): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({
      sub: 'user-1',
      organizationId: 'org-1',
      branchId: null,
      email: 'owner@kiotviet-off.vn',
      permissions: [],
      permissionVersion: 1,
      isPlatformAdmin: false,
      exp: now + 900,
      iat: now,
    }),
    'sig',
  ].join('.');
}

test.describe('Multi-tab session restoration — no false reuse detection (SPEC-T031 FR10, AC6)', () => {
  test(`${TAB_COUNT} tabs restoring near-simultaneously produce exactly one real /auth/refresh call`, async ({
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: 'refresh_token', value: 'fake-refresh-token-for-e2e', url: baseURL! },
    ]);

    let refreshCallCount = 0;
    const accessToken = fakeAccessToken();

    await context.route(REFRESH_ENDPOINT, async (route) => {
      refreshCallCount += 1;
      // A brief delay gives every tab's initial restore attempt time to actually
      // race the lock/mutex, instead of resolving so fast they serialize by luck.
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        // T051.08A — real envelope shape (backend's TransformInterceptor wraps every 2xx body);
        // the old flat body here is exactly what masked refreshAccessToken()'s envelope-unwrap
        // bug from every test (including this one) until a real browser hit a real backend
        // (T051.08).
        body: JSON.stringify({
          success: true,
          data: {
            accessToken,
            userInfo: {
              id: 'user-1',
              email: 'owner@kiotviet-off.vn',
              username: 'owner',
              organizationId: 'org-1',
              branchId: null,
              permissions: [],
            },
          },
          meta: null,
          traceId: 't-1',
          timestamp: new Date().toISOString(),
        }),
      });
    });

    await context.route(ORG_ENDPOINT, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'org-1', name: 'KiotViet Off', slug: 'kiotviet-off' }),
      });
    });

    const pages = await Promise.all(Array.from({ length: TAB_COUNT }, () => context.newPage()));

    await Promise.all(pages.map((page) => page.goto('/dashboard')));

    for (const page of pages) {
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    }

    // The real proof this SPEC's own §12 coordination layer was exercised, not
    // just that every tab happened to end up authenticated some other way.
    expect(refreshCallCount).toBe(1);

    await Promise.all(pages.map((page) => page.close()));
  });
});
