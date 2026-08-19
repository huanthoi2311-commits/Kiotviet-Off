import fs from 'fs';
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
  type Response,
} from '@playwright/test';
import { FIXTURES_PATH, ReleaseFixtures } from './global-setup';
import { apiLoginWithRetry, backendBaseUrl, frontendBaseUrl, selectCombobox } from './support';

/**
 * T053.05B — ARCHITECT DECISION "PRE-MERGE BLOCKER: RELEASE E2E QUOTA PROOF REQUIRED". Real-browser
 * proof that Usage-Limit Enforcement actually rejects over-quota creates end-to-end (real
 * frontend/backend/Postgres/Redis/auth/RBAC), and that the existing generic frontend error
 * plumbing (`form.setServerError`, T034/T036.10) surfaces the server-provided commercial message
 * without any new frontend production code.
 *
 * Same PLATFORM ACTOR / TENANT ACTOR separation as `entitlement.spec.ts` — Platform Admin is used
 * ONLY to provision a Organization via `POST /organizations` (route thật), never to perform the
 * User/Product creates under test (no commercial bypass — Architect Decision, post-T053.02A).
 *
 * A DEDICATED Organization is created per test here (NOT the shared `ENTERPRISE` Release Fixture
 * Organization from `global-setup.ts`, whose max* are all null/unlimited and would never exercise
 * quota enforcement) — `plan: TRIAL`, canonical `maxUser=3`/`maxProduct=50`
 * (`SUBSCRIPTION_PLAN_LIMITS.TRIAL`, backend/src/modules/organization/domain/policies/
 * subscription-plan-defaults.ts).
 */
test.describe.serial('T053.05B — Usage Limit Enforcement (real stack, real browser)', () => {
  test.describe.configure({ timeout: 240_000 });

  let bootstrapFixtures: ReleaseFixtures;
  let platformActorToken: string;

  test.beforeAll(async () => {
    // Cùng lý do nới timeout hook như entitlement.spec.ts — apiLoginWithRetry có budget backoff
    // tới 75s dưới throttle contention thật, vượt timeout mặc định 60000ms của beforeAll.
    test.setTimeout(180_000);
    bootstrapFixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf-8')) as ReleaseFixtures;
    // global-setup.ts đã promote bootstrap admin qua CLI production thật (T053.02A) — chỉ cần đăng
    // nhập LẠI để lấy JWT isPlatformAdmin=true, không promote thêm lần nào nữa.
    platformActorToken = (
      await apiLoginWithRetry(
        bootstrapFixtures.bootstrapOrganizationSlug,
        bootstrapFixtures.bootstrapAdminEmail,
        bootstrapFixtures.bootstrapAdminPassword,
      )
    ).accessToken;
  });

  /** PLATFORM ACTOR — chỉ dùng cho POST /organizations, không bao giờ cho route nghiệp vụ tenant. */
  async function createTenantOrgWithPlan(plan: 'TRIAL', label: string) {
    const api = await playwrightRequest.newContext();
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const slug = `usage-e2e-${label}-${unique}`;
    const email = `usage-e2e-${label}-${unique}@pos-erp-release-e2e.local`;
    const password = `UsageE2ePass@${unique}`;
    const res = await api.post(`${backendBaseUrl()}/organizations`, {
      headers: { Authorization: `Bearer ${platformActorToken}` },
      data: {
        organization: { displayName: `Usage Limit E2E ${label}`, slug },
        owner: { fullName: `Owner ${label}`, email, password },
        subscription: { plan },
      },
    });
    expect(res.ok(), `Tạo Organization plan=${plan} thất bại: ${await res.text()}`).toBeTruthy();
    await api.dispose();
    return { slug, email, password };
  }

  // Cùng budget throttle /auth/login (5 lần/60s/IP) với mọi spec khác trong cùng worker
  // (`playwright.release.config.ts` có `workers: 1`) — cùng pattern retry-với-backoff đã dùng ở
  // `entitlement.spec.ts`/`user-management.spec.ts`.
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

  async function apiLogin(
    organizationSlug: string,
    email: string,
    password: string,
  ): Promise<string> {
    const api = await playwrightRequest.newContext();
    const res = await api.post(`${backendBaseUrl()}/auth/login`, {
      data: { organizationSlug, email, password },
    });
    expect(res.ok(), `Đăng nhập API thất bại: ${await res.text()}`).toBeTruthy();
    const accessToken = (await res.json()).data.accessToken as string;
    await api.dispose();
    return accessToken;
  }

  test('User quota (TRIAL maxUser=3): tạo qua UI thật tới đúng hạn mức, vượt hạn mức bị từ chối 409 SUBSCRIPTION_001 qua UI thật, không ghi thêm User', async ({
    browser,
  }) => {
    const org = await createTenantOrgWithPlan('TRIAL', 'user-quota');
    const ownerAccessToken = await apiLogin(org.slug, org.email, org.password);
    const api = await playwrightRequest.newContext();

    async function currentUserUsage(): Promise<number> {
      const res = await api.get(`${backendBaseUrl()}/users`, {
        headers: { Authorization: `Bearer ${ownerAccessToken}` },
        params: { limit: '1' },
      });
      expect(res.ok()).toBeTruthy();
      return (await res.json()).data.total as number;
    }

    // A — usage thật hiện tại qua API (Owner bootstrap của Organization vừa tạo đã chiếm 1 seat —
    // KHÔNG giả định tenant bắt đầu ở 0/3, Architect §5).
    const startingUsage = await currentUserUsage();
    expect(startingUsage).toBe(1);
    // TRIAL canonical (SUBSCRIPTION_PLAN_LIMITS.TRIAL.maxUser) — chứng minh lại bằng chính hành vi
    // 409 ở bước D bên dưới, không chỉ là con số giả định đứng riêng.
    const maxUser = 3;

    const context = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const page = await context.newPage();
    await uiLogin(page, org.slug, org.email, org.password);

    // B/C — tạo qua UI thật tới ĐÚNG hạn mức.
    const toCreate = maxUser - startingUsage;
    for (let i = 0; i < toCreate; i += 1) {
      const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}-${i}`;
      await page.goto('/users/new');
      await page.getByLabel('Tên đăng nhập').fill(`uq-${suffix}`);
      await page.getByLabel('Email').fill(`uq-${suffix}@pos-erp-release-e2e.local`);
      await page.getByLabel('Mật khẩu', { exact: true }).fill('UsageQuota@123');
      await page.getByLabel('Xác nhận mật khẩu').fill('UsageQuota@123');
      await page.getByRole('button', { name: 'Tạo nhân viên' }).click();
      await page.waitForURL(/\/users\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    }
    await expect.poll(() => currentUserUsage(), { timeout: 10_000 }).toBe(maxUser);

    // D — 1 lần tạo NỮA qua UI thật, đúng tại boundary → phải bị từ chối.
    const overSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}-over`;
    await page.goto('/users/new');
    await page.getByLabel('Tên đăng nhập').fill(`uq-over-${overSuffix}`);
    await page.getByLabel('Email').fill(`uq-over-${overSuffix}@pos-erp-release-e2e.local`);
    await page.getByLabel('Mật khẩu', { exact: true }).fill('UsageQuota@123');
    await page.getByLabel('Xác nhận mật khẩu').fill('UsageQuota@123');

    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().endsWith('/users') && res.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Tạo nhân viên' }).click(),
    ]);

    // E — bằng chứng THẬT qua network response (không chỉ text hiển thị trên UI).
    expect(response.status()).toBe(409);
    const body = (await response.json()) as { code: string; message: string };
    expect(body.code).toBe('SUBSCRIPTION_001');

    // F/G — UI hiển thị thông báo rõ ràng; form vẫn dùng được, không crash, không bị điều hướng đi.
    expect(page.url()).toContain('/users/new');
    const alert = page.locator('[data-slot="alert"]');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toHaveText(body.message);

    // H — xác nhận trực tiếp qua backend: không có User thừa nào được ghi.
    await expect.poll(() => currentUserUsage(), { timeout: 10_000 }).toBe(maxUser);

    await api.dispose();
    await context.close();
  });

  test('Product quota (TRIAL maxProduct=50): pre-fill 49 qua API production thật, boundary (thứ 50) + vượt hạn mức (thứ 51) qua UI thật, không ghi thêm Product', async ({
    browser,
  }) => {
    const org = await createTenantOrgWithPlan('TRIAL', 'product-quota');
    const ownerAccessToken = await apiLogin(org.slug, org.email, org.password);
    const api: APIRequestContext = await playwrightRequest.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${ownerAccessToken}` },
    });

    async function currentProductUsage(): Promise<number> {
      const res = await api.get(`${backendBaseUrl()}/products`, { params: { limit: '1' } });
      expect(res.ok()).toBeTruthy();
      return (await res.json()).data.total as number;
    }

    // TRIAL canonical (SUBSCRIPTION_PLAN_LIMITS.TRIAL.maxProduct).
    const maxProduct = 50;
    const startingUsage = await currentProductUsage();
    expect(startingUsage).toBe(0);

    // Category/Unit RIÊNG cho Organization này — KHÔNG dùng chung Release Fixture Organization
    // (ENTERPRISE, unlimited) của global-setup.ts.
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const categoryRes = await api.post(`${backendBaseUrl()}/categories`, {
      data: { code: `PQ-CAT-${unique}`, name: `Danh mục Product Quota ${unique}` },
    });
    expect(categoryRes.ok(), `Tạo Category thất bại: ${await categoryRes.text()}`).toBeTruthy();
    const category = (await categoryRes.json()).data as { id: string; name: string };

    const unitRes = await api.post(`${backendBaseUrl()}/units`, {
      data: { code: `PQ-UNIT-${unique}`, name: `Đơn vị Product Quota ${unique}`, symbol: 'pq' },
    });
    expect(unitRes.ok(), `Tạo Unit thất bại: ${await unitRes.text()}`).toBeTruthy();
    const unit = (await unitRes.json()).data as { id: string; name: string };

    // §8/§9 — "đã-authorized production mechanism" để đưa tenant về gần boundary: 49 lần POST
    // /products THẬT (route production thật, KHÔNG raw DB mutation), tuần tự (không đua nhau vào
    // cùng 1 advisory lock để giữ kết quả tất định) — TRÁNH vòng lặp UI khổng lồ/chậm/giòn (Architect
    // §8 "do NOT create a huge slow UI loop"). Chỉ 2 lần tạo CUỐI (boundary + vượt hạn mức) chạy qua
    // trình duyệt thật bên dưới.
    const prefillCount = maxProduct - startingUsage - 1;
    for (let i = 0; i < prefillCount; i += 1) {
      const res = await api.post(`${backendBaseUrl()}/products`, {
        data: {
          type: 'STANDARD',
          categoryId: category.id,
          unitId: unit.id,
          name: `Product Quota Fixture ${unique}-${i}`,
          costPrice: 50000,
          prices: [{ type: 'RETAIL', price: 100000 }],
        },
      });
      expect(res.ok(), `Pre-fill Product #${i} thất bại: ${await res.text()}`).toBeTruthy();
    }
    await expect.poll(() => currentProductUsage(), { timeout: 20_000 }).toBe(maxProduct - 1);

    const context = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const page = await context.newPage();
    await uiLogin(page, org.slug, org.email, org.password);

    // Boundary — sản phẩm thứ 50 qua UI thật → thành công (usage đạt ĐÚNG maxProduct).
    await page.goto('/products/new');
    await page.getByLabel('Tên sản phẩm').fill(`Product Quota Boundary ${unique}`);
    await selectCombobox(page, 'Danh mục', category.name);
    await selectCombobox(page, 'Đơn vị tính', unit.name);
    await page.getByRole('button', { name: 'Tạo sản phẩm' }).click();
    await page.waitForURL('**/products', { timeout: 15_000 });
    await expect.poll(() => currentProductUsage(), { timeout: 10_000 }).toBe(maxProduct);

    // Over-limit — sản phẩm thứ 51 qua UI thật → phải bị từ chối.
    await page.goto('/products/new');
    await page.getByLabel('Tên sản phẩm').fill(`Product Quota Over ${unique}`);
    await selectCombobox(page, 'Danh mục', category.name);
    await selectCombobox(page, 'Đơn vị tính', unit.name);

    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().endsWith('/products') && res.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Tạo sản phẩm' }).click(),
    ]);

    expect(response.status()).toBe(409);
    const body = (await response.json()) as { code: string; message: string };
    expect(body.code).toBe('SUBSCRIPTION_001');

    expect(page.url()).toContain('/products/new');
    const alert = page.locator('[data-slot="alert"]');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toHaveText(body.message);

    // Xác nhận trực tiếp qua backend: không có Product thừa nào được ghi.
    await expect.poll(() => currentProductUsage(), { timeout: 10_000 }).toBe(maxProduct);

    await api.dispose();
    await context.close();
  });
});
