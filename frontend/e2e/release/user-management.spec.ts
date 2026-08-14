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
 * T052.02C §18 — real-browser proof cho User Management, hoàn toàn TÁCH BIỆT khỏi
 * `critical-path.spec.ts` (không dùng `sharedContext`/`sharedPage` của file đó — flow này cần
 * NHIỀU phiên đăng nhập độc lập thật sự: Owner và User thứ 2, không phải 1 phiên liên tục).
 *
 * KHÔNG mock backend/network — chạy đối với stack Compose thật (T051.04), giống hệt
 * `critical-path.spec.ts`. Vai trò 'owner' được gán qua API THẬT (đã được Architect uỷ quyền rõ —
 * §18: "acceptable for test/bootstrap code to assign an already-existing role through the existing
 * backend endpoint/API setup") — mọi thao tác User Management khác (tạo/vô hiệu hóa/kích hoạt
 * lại/đặt lại mật khẩu) đều qua UI thật.
 *
 * `POST /auth/login` bị Throttle 5 lần/60s/IP (`auth.controller.ts`) — CHUNG một budget với
 * `critical-path.spec.ts` (chạy TRƯỚC file này, trong CÙNG 1 worker/IP, `playwright.release.
 * config.ts` có `workers: 1`) VÀ với chính nhiều bước đăng nhập/đăng-nhập-lại của Owner/User thứ 2
 * trong file này (đã xác nhận qua CI thật: lần chạy đầu bị đúng `HTTP_429` ở lệnh gọi thứ 6). Đây
 * là throttle ĐANG hoạt động đúng thiết kế, không phải lỗi sản phẩm — `submitLoginAndWaitResponse()`
 * dưới đây retry-với-backoff khi gặp 429, giống cách 1 client thật cần xử lý rate-limit, không né
 * tránh/vô hiệu hóa throttle.
 */
test.describe.serial('T052.02C — User Management (real stack)', () => {
  let fixtures: ReleaseFixtures;

  let secondUserId: string;
  let secondUsername: string;
  let secondEmail: string;
  let secondPassword: string;
  let secondNewPassword: string;

  test.beforeAll(() => {
    fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf-8')) as ReleaseFixtures;
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    secondUsername = `um-e2e-${suffix}`;
    secondEmail = `um-e2e-${suffix}@pos-erp-release-e2e.local`;
    secondPassword = `UmE2ePass@${suffix}`;
    secondNewPassword = `UmE2eNewPass@${suffix}`;
  });

  const LOGIN_THROTTLE_MAX_ATTEMPTS = 5;
  const LOGIN_THROTTLE_BACKOFF_MS = 15_000;

  async function submitLoginAndWaitResponse(
    page: Page,
    email: string,
    password: string,
  ): Promise<Response> {
    for (let attempt = 1; attempt <= LOGIN_THROTTLE_MAX_ATTEMPTS; attempt += 1) {
      await page.goto('/login');
      await page.getByLabel('Mã tổ chức').fill(fixtures.organizationSlug);
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

  async function uiLogin(page: Page, email: string, password: string): Promise<void> {
    const response = await submitLoginAndWaitResponse(page, email, password);
    expect(
      response.ok(),
      `Đăng nhập thất bại ngoài dự kiến (status ${response.status()})`,
    ).toBeTruthy();
    await page.waitForURL('**/dashboard', { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  }

  async function uiLoginExpectFailure(page: Page, email: string, password: string): Promise<void> {
    const response = await submitLoginAndWaitResponse(page, email, password);
    // Phải là lỗi xác thực THẬT (401 AUTH_001/AUTH_002) — 429 đã được retry hết ở trên rồi mới tới
    // đây, nên nếu vẫn còn 429 thì đó là throttle chưa giải quyết được, không phải phép thử đang cần.
    expect(response.status()).not.toBe(429);
    expect(response.ok()).toBeFalsy();
    // Stays on /login with a visible error alert — never reaches /dashboard.
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain('/login');
  }

  // ============================================================
  test('1. Owner tạo nhân viên thứ 2 qua UI thật, thấy trong danh sách/chi tiết, đăng xuất', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const page = await context.newPage();

    await uiLogin(page, fixtures.adminEmail, fixtures.adminPassword);

    // §2/§3 — điều hướng qua chính nav thật (chứng minh nav được gate đúng bởi user:view cho owner).
    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Nhân viên' }).click();
    await page.waitForURL('**/users');
    await expect(page.getByRole('heading', { name: 'Nhân viên' })).toBeVisible();

    await page.getByRole('link', { name: 'Thêm nhân viên' }).click();
    await page.waitForURL('**/users/new');

    await page.getByLabel('Tên đăng nhập').fill(secondUsername);
    await page.getByLabel('Email').fill(secondEmail);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(secondPassword);
    await page.getByLabel('Xác nhận mật khẩu').fill(secondPassword);
    await page.getByRole('button', { name: 'Tạo nhân viên' }).click();

    await page.waitForURL(/\/users\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    secondUserId = page.url().split('/users/')[1];
    await expect(page.getByLabel('Tên đăng nhập')).toHaveValue(secondUsername);
    await expect(page.getByLabel('Email')).toHaveValue(secondEmail);

    await page.goto('/users');
    await page
      .getByPlaceholder('Tìm theo tên đăng nhập, họ tên hoặc email...')
      .fill(secondUsername);
    await expect(page.getByRole('cell', { name: secondUsername, exact: true })).toBeVisible({
      timeout: 5_000,
    });

    // §18 step 5 — real logout.
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await page.waitForURL('**/login', { timeout: 15_000 });

    await context.close();
  });

  // ============================================================
  test('2. Nhân viên thứ 2 đăng nhập bằng mật khẩu admin đặt — xác thực thành công, chưa có quyền', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const page = await context.newPage();

    await uiLogin(page, secondEmail, secondPassword);

    // Chưa được gán role nào → 0 quyền → route được bảo vệ hiển thị UnauthorizedState (không lỗi
    // ở tầng auth, chỉ ở tầng permission — chứng minh 2 tầng độc lập).
    await page.goto('/users');
    await expect(page.getByText('Bạn không có quyền truy cập')).toBeVisible();

    await context.close();
  });

  // ============================================================
  test('3. Gán role "owner" đã có sẵn qua API — sau khi đăng nhập lại, quyền truy cập UI khớp với role', async ({
    browser,
  }) => {
    // Tái dùng token bootstrap của chính global-setup.ts (còn hạn — JWT_ACCESS_EXPIRES_IN=15m —
    // đủ cho toàn bộ suite) thay vì tự đăng nhập THÊM một lần nữa — cùng lý do đã được ghi chú kỹ
    // ở `critical-path.spec.ts`'s `beforeAll`: /auth/login bị Throttle 5 lần/60s, mỗi lần đăng nhập
    // thừa cộng dồn vào budget CHUNG của toàn bộ release-e2e run.
    const api = await playwrightRequest.newContext();
    const ownerAccessToken = fixtures.adminAccessToken;

    const rolesRes = await api.get(`${backendBaseUrl()}/roles`, {
      headers: { Authorization: `Bearer ${ownerAccessToken}` },
    });
    expect(rolesRes.ok()).toBeTruthy();
    const roles = (await rolesRes.json()).data as { id: string; code: string }[];
    const ownerRole = roles.find((r) => r.code === 'owner');
    expect(ownerRole, 'Role "owner" phải tồn tại sẵn từ First Admin bootstrap').toBeDefined();

    const assignRes = await api.post(`${backendBaseUrl()}/roles/assign`, {
      headers: { Authorization: `Bearer ${ownerAccessToken}` },
      data: { userId: secondUserId, roleId: ownerRole!.id },
    });
    expect(assignRes.ok(), `Gán role thất bại: ${await assignRes.text()}`).toBeTruthy();
    await api.dispose();

    // permissionVersion đã tăng (RbacService.assignRoleToUser) — token cũ (nếu còn) đã lỗi thời;
    // đăng nhập MỚI để lấy token mang đúng permissions[] cập nhật.
    const context = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const page = await context.newPage();
    await uiLogin(page, secondEmail, secondPassword);

    await page.goto('/users');
    await expect(page.getByRole('heading', { name: 'Nhân viên' })).toBeVisible();
    await expect(page.getByText('Bạn không có quyền truy cập')).not.toBeVisible();

    await context.close();
  });

  // ============================================================
  test('4. Owner vô hiệu hóa nhân viên thứ 2 qua UI — đăng nhập sau đó bị từ chối', async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const ownerPage = await ownerContext.newPage();
    await uiLogin(ownerPage, fixtures.adminEmail, fixtures.adminPassword);

    await ownerPage.goto(`/users/${secondUserId}`);
    await ownerPage.getByRole('button', { name: 'Vô hiệu hóa' }).click();
    const dialog = ownerPage.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Vô hiệu hóa' }).click();
    await expect(dialog).toBeHidden();
    await expect(ownerPage.getByText('Ngừng hoạt động')).toBeVisible();
    await ownerContext.close();

    const secondContext = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const secondPage = await secondContext.newPage();
    await uiLoginExpectFailure(secondPage, secondEmail, secondPassword);
    await secondContext.close();
  });

  // ============================================================
  test('5. Owner kích hoạt lại nhân viên thứ 2 qua UI — đăng nhập lại thành công', async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const ownerPage = await ownerContext.newPage();
    await uiLogin(ownerPage, fixtures.adminEmail, fixtures.adminPassword);

    await ownerPage.goto(`/users/${secondUserId}`);
    await ownerPage.getByRole('button', { name: 'Kích hoạt lại' }).click();
    const dialog = ownerPage.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Kích hoạt lại' }).click();
    await expect(dialog).toBeHidden();
    await expect(ownerPage.getByText('Đang hoạt động')).toBeVisible();
    await ownerContext.close();

    const secondContext = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const secondPage = await secondContext.newPage();
    await uiLogin(secondPage, secondEmail, secondPassword);
    await secondContext.close();
  });

  // ============================================================
  test('6. Owner đặt lại mật khẩu nhân viên thứ 2 qua UI — mật khẩu cũ thất bại, mật khẩu mới thành công', async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const ownerPage = await ownerContext.newPage();
    await uiLogin(ownerPage, fixtures.adminEmail, fixtures.adminPassword);

    await ownerPage.goto(`/users/${secondUserId}`);
    await ownerPage.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
    const dialog = ownerPage.getByRole('dialog', { name: 'Đặt lại mật khẩu' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Mật khẩu mới', { exact: true }).fill(secondNewPassword);
    await dialog.getByLabel('Xác nhận mật khẩu mới').fill(secondNewPassword);
    await dialog.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await ownerContext.close();

    const oldPasswordContext = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const oldPasswordPage = await oldPasswordContext.newPage();
    await uiLoginExpectFailure(oldPasswordPage, secondEmail, secondPassword);
    await oldPasswordContext.close();

    const newPasswordContext = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const newPasswordPage = await newPasswordContext.newPage();
    await uiLogin(newPasswordPage, secondEmail, secondNewPassword);
    await newPasswordContext.close();
  });
});
