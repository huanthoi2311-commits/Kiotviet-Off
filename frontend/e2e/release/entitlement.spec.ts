import fs from 'fs';
import {
  test,
  expect,
  request as playwrightRequest,
  type Page,
  type Response,
} from '@playwright/test';
import { FIXTURES_PATH, ReleaseFixtures } from './global-setup';
import { apiLoginWithRetry, backendBaseUrl, frontendBaseUrl } from './support';

/**
 * T053.03 §21 / T053.02A integration — real-browser proof cho Feature Entitlements (CASE A-D),
 * chạy đối với stack Compose thật (T051.04), giống hệt `critical-path.spec.ts`/
 * `user-management.spec.ts`.
 *
 * Architect Decision (Platform Admin Entitlement Bypass, post-T053.02A) — 2 vai trò TÁCH BIỆT
 * trong toàn bộ file này, không bao giờ trộn lẫn:
 *
 *   PLATFORM ACTOR — chỉ dùng để provision Organization/Plan qua `POST /organizations` (route
 *   Platform Admin THẬT). Không bao giờ dùng token này để gọi route nghiệp vụ tenant (POST
 *   /users, GET nav...) — kể từ Architect Decision, Platform Admin KHÔNG còn bypass entitlement
 *   trên route tenant, nên dùng token đó cho việc đó sẽ chỉ đo lại đúng hành vi của CASE B/C, gây
 *   nhầm lẫn ý nghĩa test.
 *
 *   TENANT ACTOR — Owner (hoặc user không-permission) CỦA CHÍNH Organization vừa tạo, dùng để
 *   thực sự thao tác UI/API nghiệp vụ trong mỗi CASE.
 *
 * Platform Admin được thiết lập qua ĐÚNG cơ chế production T053.02A — `docker compose run --rm
 * bring-up npm run platform-admin:promote` — KHÔNG raw Prisma mutation, KHÔNG bypass
 * PlatformAdminGuard nào khác. Idempotent (an toàn nếu 1 lần chạy trước đã promote rồi).
 */
test.describe
  .serial('T053.03 — Feature Entitlements (real stack, real Platform Admin CLI) CASE A-D', () => {
  test.describe.configure({ timeout: 180_000 });

  let fixtures: ReleaseFixtures;
  let platformActorToken: string;

  test.beforeAll(async () => {
    fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf-8')) as ReleaseFixtures;

    // `global-setup.ts` đã promote Organization bootstrap's admin qua đúng CLI production
    // (T053.02A) TRƯỚC khi bất kỳ spec file nào chạy (cần thiết cho chính nó để tạo Release
    // Fixture Organization) — ở đây chỉ cần đăng nhập LẠI để lấy JWT isPlatformAdmin=true, không
    // promote thêm lần nào nữa (dù promote lại vẫn an toàn/idempotent, tránh gọi trùng
    // `docker compose run` không cần thiết). Dùng `apiLoginWithRetry` (T053.03 Login Throttle
    // Stabilization) — cùng budget throttle 5 lần/60s/IP với mọi lần đăng nhập khác trong suite,
    // retry-với-backoff CHỈ cho 429, không che giấu lỗi xác thực thật.
    platformActorToken = (
      await apiLoginWithRetry(
        fixtures.bootstrapOrganizationSlug,
        fixtures.bootstrapAdminEmail,
        fixtures.bootstrapAdminPassword,
      )
    ).accessToken;
  });

  /** PLATFORM ACTOR — chỉ dùng cho POST /organizations, không bao giờ cho route nghiệp vụ tenant. */
  async function createTenantOrgWithPlan(plan: 'TRIAL' | 'BASIC' | 'PRO', label: string) {
    const api = await playwrightRequest.newContext();
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const slug = `ent-e2e-${label}-${unique}`;
    const email = `ent-e2e-${label}-${unique}@pos-erp-release-e2e.local`;
    const password = `EntE2ePass@${unique}`;
    const res = await api.post(`${backendBaseUrl()}/organizations`, {
      headers: { Authorization: `Bearer ${platformActorToken}` },
      data: {
        organization: { displayName: `Entitlement E2E ${label}`, slug },
        owner: { fullName: `Owner ${label}`, email, password },
        subscription: { plan },
      },
    });
    expect(res.ok(), `Tạo Organization plan=${plan} thất bại: ${await res.text()}`).toBeTruthy();
    await api.dispose();
    return { slug, email, password };
  }

  // Cùng budget throttle /auth/login (5 lần/60s/IP) với các spec khác trong cùng worker — cùng
  // pattern retry-với-backoff đã dùng ở `user-management.spec.ts`.
  const LOGIN_THROTTLE_MAX_ATTEMPTS = 5;
  const LOGIN_THROTTLE_BACKOFF_MS = 15_000;

  async function submitLoginAndWaitResponse(
    page: Page,
    organizationSlug: string,
    email: string,
    password: string,
  ): Promise<Response> {
    for (let attempt = 1; attempt <= LOGIN_THROTTLE_MAX_ATTEMPTS; attempt += 1) {
      await page.goto('/login');
      await page.getByLabel('Mã tổ chức').fill(organizationSlug);
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Mật khẩu').fill(password);
      const [response] = await Promise.all([
        page.waitForResponse(
          (res) => res.url().endsWith('/auth/login') && res.request().method() === 'POST',
        ),
        page.getByRole('button', { name: 'Đăng nhập' }).click(),
      ]);
      if (response.status() !== 429) return response;
      await page.waitForTimeout(LOGIN_THROTTLE_BACKOFF_MS);
    }
    throw new Error('/auth/login vẫn bị throttle (429) sau nhiều lần retry-với-backoff');
  }

  /** TENANT ACTOR đăng nhập qua UI thật. */
  async function uiLogin(
    page: Page,
    organizationSlug: string,
    email: string,
    password: string,
  ): Promise<void> {
    const response = await submitLoginAndWaitResponse(page, organizationSlug, email, password);
    expect(response.ok(), `Đăng nhập thất bại (status ${response.status()})`).toBeTruthy();
    await page.waitForURL('**/dashboard', { timeout: 30_000 });
  }

  async function apiLogin(organizationSlug: string, email: string, password: string) {
    const api = await playwrightRequest.newContext();
    const res = await api.post(`${backendBaseUrl()}/auth/login`, {
      data: { organizationSlug, email, password },
    });
    expect(res.ok(), `Đăng nhập API thất bại: ${await res.text()}`).toBeTruthy();
    const accessToken = (await res.json()).data.accessToken as string;
    await api.dispose();
    return accessToken;
  }

  /** TENANT ACTOR (Owner) tạo 1 user thứ 2 KHÔNG có role/permission nào — dùng cho CASE C. */
  async function createNoPermissionTenantUser(ownerAccessToken: string, organizationSlug: string) {
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const email = `noperm-${unique}@pos-erp-release-e2e.local`;
    const password = `NoPermE2e@${unique}`;
    const api = await playwrightRequest.newContext();
    const res = await api.post(`${backendBaseUrl()}/users`, {
      headers: { Authorization: `Bearer ${ownerAccessToken}` },
      data: { username: `noperm-${unique}`, email, password },
    });
    expect(res.ok(), `Tạo user không-quyền thất bại: ${await res.text()}`).toBeTruthy();
    await api.dispose();
    return { email, password, organizationSlug };
  }

  test('CASE A: TRIAL (entitled) + RBAC permitted → User Management khả dụng (nav + trang)', async ({
    browser,
  }) => {
    const org = await createTenantOrgWithPlan('TRIAL', 'case-a');
    const context = await browser.newContext({ baseURL: frontendBaseUrl() });
    const page = await context.newPage();
    await uiLogin(page, org.slug, org.email, org.password);

    await expect(page.getByRole('link', { name: 'Nhân viên' })).toBeVisible();
    await page.getByRole('link', { name: 'Nhân viên' }).click();
    await page.waitForURL('**/users');
    await expect(page.getByRole('heading', { name: 'Nhân viên' })).toBeVisible();
    await expect(page.getByText('Không có trong gói hiện tại')).not.toBeVisible();
    await expect(page.getByText('Bạn không có quyền truy cập')).not.toBeVisible();

    await context.close();
  });

  test('CASE B: BASIC (không entitled) — cùng RBAC, bị chặn bởi entitlement (nav ẩn, truy cập trực tiếp an toàn, API từ chối)', async ({
    browser,
  }) => {
    const org = await createTenantOrgWithPlan('BASIC', 'case-b');
    const context = await browser.newContext({ baseURL: frontendBaseUrl() });
    const page = await context.newPage();
    await uiLogin(page, org.slug, org.email, org.password);

    await expect(page.getByRole('link', { name: 'Nhân viên' })).not.toBeVisible();

    await page.goto('/users');
    await expect(page.getByText('Không có trong gói hiện tại')).toBeVisible();
    await expect(page.getByText('Bạn không có quyền truy cập')).not.toBeVisible();

    const accessToken = await apiLogin(org.slug, org.email, org.password);
    const api = await playwrightRequest.newContext();
    const res = await api.post(`${backendBaseUrl()}/users`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        username: `case-b-blocked-${Date.now()}`,
        email: `case-b-blocked-${Date.now()}@pos-erp-release-e2e.local`,
        password: 'BlockedPass@123',
      },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe('ENTITLEMENT_001');
    await api.dispose();

    await context.close();
  });

  test('CASE C: TRIAL (entitled) nhưng actor thiếu RBAC → vẫn bị từ chối (RBAC độc lập với entitlement)', async ({
    browser,
  }) => {
    const org = await createTenantOrgWithPlan('TRIAL', 'case-c');
    const ownerAccessToken = await apiLogin(org.slug, org.email, org.password);
    const noPermUser = await createNoPermissionTenantUser(ownerAccessToken, org.slug);

    const context = await browser.newContext({ baseURL: frontendBaseUrl() });
    const page = await context.newPage();
    await uiLogin(page, noPermUser.organizationSlug, noPermUser.email, noPermUser.password);

    // Entitlement CÓ (TRIAL) nhưng RBAC KHÔNG — nav vẫn ẩn (PermissionGate), và truy cập trực
    // tiếp hiện đúng thông báo RBAC — KHÔNG lẫn với thông báo "Không có trong gói hiện tại", vì
    // nguyên nhân thật ở đây là RBAC, không phải entitlement.
    await expect(page.getByRole('link', { name: 'Nhân viên' })).not.toBeVisible();
    await page.goto('/users');
    await expect(page.getByText('Bạn không có quyền truy cập')).toBeVisible();
    await expect(page.getByText('Không có trong gói hiện tại')).not.toBeVisible();

    await context.close();
  });

  test('CASE D: 2 Organization plan khác nhau trong cùng deployment — không rò rỉ entitlement', async ({
    browser,
  }) => {
    const basicOrg = await createTenantOrgWithPlan('BASIC', 'case-d-basic');
    const proOrg = await createTenantOrgWithPlan('PRO', 'case-d-pro');

    const basicContext = await browser.newContext({ baseURL: frontendBaseUrl() });
    const basicPage = await basicContext.newPage();
    await uiLogin(basicPage, basicOrg.slug, basicOrg.email, basicOrg.password);
    await expect(basicPage.getByRole('link', { name: 'Nhân viên' })).not.toBeVisible();
    await basicContext.close();

    const proContext = await browser.newContext({ baseURL: frontendBaseUrl() });
    const proPage = await proContext.newPage();
    await uiLogin(proPage, proOrg.slug, proOrg.email, proOrg.password);
    await expect(proPage.getByRole('link', { name: 'Nhân viên' })).toBeVisible();
    await proContext.close();
  });

  // Đối chứng bổ sung — Platform Admin (đã promote) KHÔNG bypass entitlement trên route tenant,
  // kể cả khi gọi trực tiếp qua API (không phải qua UI). JWT `organizationId` luôn là của actor
  // (không phải client-controlled) — request này thao tác lên CHÍNH Organization bootstrap của
  // Platform Admin, mặc định FREE (chưa từng đổi plan trong suite này), nên phải bị từ chối giống
  // hệt bất kỳ actor nào khác — cùng bất biến đã chứng minh ở entitlement.e2e-spec.ts (backend),
  // nay chứng minh lại qua đúng gói triển khai thật.
  test('PLATFORM ACTOR không bypass entitlement trên route tenant khi gọi trực tiếp cho Organization bootstrap của chính họ (FREE)', async () => {
    const api = await playwrightRequest.newContext();
    const res = await api.post(`${backendBaseUrl()}/users`, {
      headers: { Authorization: `Bearer ${platformActorToken}` },
      data: {
        username: `platform-actor-blocked-${Date.now()}`,
        email: `platform-actor-blocked-${Date.now()}@pos-erp-release-e2e.local`,
        password: 'BlockedPass@123',
      },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe('ENTITLEMENT_001');
    await api.dispose();
  });
});
