import fs from 'fs';
import {
  test,
  expect,
  request as playwrightRequest,
  type Page,
  type Response,
} from '@playwright/test';
import { FIXTURES_PATH, ReleaseFixtures } from './global-setup';
import { backendBaseUrl, frontendBaseUrl } from './support';

/**
 * T053.03 §21 — real-browser proof cho Feature Entitlements (CASE A-D), chạy đối với stack Compose
 * thật (T051.04), giống hệt `critical-path.spec.ts`/`user-management.spec.ts`.
 *
 * Không cần endpoint "đổi Plan" (T053.07, chưa được uỷ quyền) — mỗi CASE tạo một Organization MỚI
 * với `subscription.plan` tường minh ngay lúc tạo, qua `POST /organizations` đã có sẵn/được uỷ quyền
 * từ T053.02 (dùng token bootstrap First Admin — Platform Admin thật). Không xây dựng UI quản lý
 * subscription chỉ để phục vụ test này (§21 cấm rõ).
 */
test.describe.serial('T053.03 — Feature Entitlements (real stack) CASE A-D', () => {
  test.describe.configure({ timeout: 120_000 });

  let fixtures: ReleaseFixtures;

  test.beforeAll(() => {
    fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf-8')) as ReleaseFixtures;
  });

  async function createOrgWithPlan(plan: 'TRIAL' | 'BASIC' | 'PRO', label: string) {
    const api = await playwrightRequest.newContext();
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const slug = `ent-e2e-${label}-${suffix}`;
    const email = `ent-e2e-${label}-${suffix}@pos-erp-release-e2e.local`;
    const password = `EntE2ePass@${suffix}`;
    const res = await api.post(`${backendBaseUrl()}/organizations`, {
      headers: { Authorization: `Bearer ${fixtures.adminAccessToken}` },
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
  // pattern retry-với-backoff đã dùng ở `user-management.spec.ts` (không né tránh throttle, xử lý
  // như 1 client thật).
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

  test('CASE A: TRIAL — Nhân viên + Vai trò hiển thị trên nav', async ({ browser }) => {
    const org = await createOrgWithPlan('TRIAL', 'case-a');
    const context = await browser.newContext({ baseURL: frontendBaseUrl() });
    const page = await context.newPage();
    await uiLogin(page, org.slug, org.email, org.password);

    await expect(page.getByRole('link', { name: 'Nhân viên' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Vai trò' })).toBeVisible();
    await context.close();
  });

  test('CASE B: BASIC — Nhân viên/Vai trò ẩn khỏi nav, truy cập trực tiếp an toàn, API trả lỗi entitlement', async ({
    browser,
  }) => {
    const org = await createOrgWithPlan('BASIC', 'case-b');
    const context = await browser.newContext({ baseURL: frontendBaseUrl() });
    const page = await context.newPage();
    await uiLogin(page, org.slug, org.email, org.password);

    await expect(page.getByRole('link', { name: 'Nhân viên' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Vai trò' })).not.toBeVisible();

    // §15 Direct URL safety — truy cập trực tiếp không được crash, phải hiện đúng thông báo gói
    // (KHÔNG lẫn với "Bạn không có quyền" — nguyên nhân thật là Entitlement, không phải RBAC).
    await page.goto('/users');
    await expect(page.getByText('Không có trong gói hiện tại')).toBeVisible();
    await expect(page.getByText('Bạn không có quyền truy cập')).not.toBeVisible();

    await page.goto('/roles');
    await expect(page.getByText('Không có trong gói hiện tại')).toBeVisible();

    // Hard gate thật sự nằm ở backend — gọi thẳng API xác nhận rejection độc lập với UI.
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

  test('CASE C: PRO — Nhân viên + Vai trò hiển thị và dùng được', async ({ browser }) => {
    const org = await createOrgWithPlan('PRO', 'case-c');
    const context = await browser.newContext({ baseURL: frontendBaseUrl() });
    const page = await context.newPage();
    await uiLogin(page, org.slug, org.email, org.password);

    await page.getByRole('link', { name: 'Nhân viên' }).click();
    await page.waitForURL('**/users');
    await expect(page.getByRole('heading', { name: 'Nhân viên' })).toBeVisible();
    await expect(page.getByText('Không có trong gói hiện tại')).not.toBeVisible();

    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Vai trò' }).click();
    await page.waitForURL('**/roles');
    await expect(page.getByRole('heading', { name: 'Vai trò' })).toBeVisible();
    await expect(page.getByText('Không có trong gói hiện tại')).not.toBeVisible();

    await context.close();
  });

  test('CASE D: 2 Organization plan khác nhau trong cùng deployment — không rò rỉ entitlement', async ({
    browser,
  }) => {
    const basicOrg = await createOrgWithPlan('BASIC', 'case-d-basic');
    const proOrg = await createOrgWithPlan('PRO', 'case-d-pro');

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
});
