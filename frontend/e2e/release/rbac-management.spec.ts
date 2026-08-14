import fs from 'fs';
import { test, expect, type Page, type Response } from '@playwright/test';
import { FIXTURES_PATH, ReleaseFixtures } from './global-setup';
import { frontendBaseUrl } from './support';

/**
 * T052.03C §17 — real-browser proof for RBAC Management, against the real packaged stack (no
 * mocked network — same convention as `critical-path.spec.ts`/`user-management.spec.ts`).
 * `test.describe.serial`: CASE 2-5 build on state (role id, second user id) created by earlier
 * cases in this same file.
 *
 * `POST /auth/login` shares the SAME 5-req/60s/IP throttle budget as every other file under
 * `e2e/release/**` (`playwright.release.config.ts` `workers: 1` — strictly sequential across
 * files). `submitLoginAndWaitResponse()` below is copied verbatim from `user-management.spec.ts`'s
 * proven retry-with-backoff helper rather than re-derived, for the same reason that file gives:
 * this is throttle working as designed, not a product defect.
 */
test.describe.serial('T052.03C — RBAC Management (real stack)', () => {
  // Same rationale as `user-management.spec.ts`: default 60s per-test timeout is shorter than the
  // worst-case throttle-recovery wait (up to 5 × 15s = 75s) plus real UI interaction time, and
  // several tests below perform TWO logins (owner + second user) in sequence.
  test.describe.configure({ timeout: 150_000 });

  let fixtures: ReleaseFixtures;

  let secondUserId: string;
  let secondUsername: string;
  let secondEmail: string;
  let secondPassword: string;

  let limitedRoleId: string;
  let limitedRoleCode: string;
  let limitedRoleName: string;

  test.beforeAll(() => {
    fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf-8')) as ReleaseFixtures;
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    secondUsername = `rbac-e2e-${suffix}`;
    secondEmail = `rbac-e2e-${suffix}@pos-erp-release-e2e.local`;
    secondPassword = `RbacE2ePass@${suffix}`;
    limitedRoleCode = `re2e_limited_${suffix}`;
    // §14 — `test.describe.serial` retries the WHOLE block on failure (`playwright.release.config.ts`
    // `retries: 1` on CI), and `beforeAll` re-runs on that retry, but data from the FAILED attempt is
    // never cleaned up. A static role name would then exist twice (leftover attempt + retry attempt),
    // making CASE 2's role-option selection ambiguous — the suffix must be in the NAME too, not just
    // the code (confirmed the hard way: this is exactly what happened on the first CI run).
    limitedRoleName = `RBAC E2E Role ${suffix}`;
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

  // ============================================================
  test('CASE 1 — Owner creates a limited role via UI (user:view only), confirms it in role detail', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const page = await context.newPage();
    await uiLogin(page, fixtures.adminEmail, fixtures.adminPassword);

    // §2 — through the real nav, proving it's gated correctly by role:view for the owner.
    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Vai trò' }).click();
    await page.waitForURL('**/roles');
    await expect(page.getByRole('heading', { name: 'Vai trò' })).toBeVisible();

    await page.getByRole('link', { name: 'Thêm vai trò' }).click();
    await page.waitForURL('**/roles/new');

    await page.getByLabel('Mã vai trò').fill(limitedRoleCode);
    await page.getByLabel('Tên vai trò').fill(limitedRoleName);
    await page.getByRole('button', { name: 'Tạo vai trò' }).click();

    await page.waitForURL(/\/roles\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    limitedRoleId = page.url().split('/roles/')[1];

    await expect(page.getByRole('checkbox', { name: 'Xem nhân viên (user:view)' })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Xem nhân viên (user:view)' }).click();
    await page.getByRole('button', { name: 'Lưu quyền' }).click();
    await expect(page.getByText(/Đã lưu quyền/)).toBeVisible({ timeout: 15_000 });

    // Reload to prove the selection was actually persisted server-side, not just optimistic UI.
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Xem nhân viên (user:view)' })).toBeChecked();

    await context.close();
  });

  // ============================================================
  test('CASE 2 — Owner creates a second user and assigns the limited role; second user sees Users but not Customers', async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const ownerPage = await ownerContext.newPage();
    await uiLogin(ownerPage, fixtures.adminEmail, fixtures.adminPassword);

    await ownerPage.goto('/users/new');
    await ownerPage.getByLabel('Tên đăng nhập').fill(secondUsername);
    await ownerPage.getByLabel('Email').fill(secondEmail);
    await ownerPage.getByLabel('Mật khẩu', { exact: true }).fill(secondPassword);
    await ownerPage.getByLabel('Xác nhận mật khẩu').fill(secondPassword);
    await ownerPage.getByRole('button', { name: 'Tạo nhân viên' }).click();

    await ownerPage.waitForURL(/\/users\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    secondUserId = ownerPage.url().split('/users/')[1];

    // §9 — Assign flow through the real "Vai trò" section on User Detail. The trigger button and
    // the dialog's own confirm button share the exact same accessible name ("Gán vai trò"), so the
    // confirm click must be scoped to the dialog to avoid a strict-mode ambiguity.
    await ownerPage.getByRole('button', { name: 'Gán vai trò' }).click();
    const assignDialog = ownerPage.getByRole('dialog');
    await expect(assignDialog).toBeVisible();
    await assignDialog.getByRole('combobox', { name: 'Vai trò' }).click();
    // Rendered option text is "{role.name} ({role.code})" — `AssignRoleDialog`'s own composition —
    // so `exact: true` against the bare name never matches (confirmed via the CI screenshot: the
    // dropdown was open with the right option visible, but the click silently kept retrying forever
    // since no element matched, until the outer 150s test timeout aborted it). `limitedRoleName` is
    // already suffix-unique, so an unqualified substring match is unambiguous.
    await ownerPage.getByRole('option', { name: limitedRoleName }).click();
    await assignDialog.getByRole('button', { name: 'Gán vai trò' }).click();
    await expect(assignDialog).toBeHidden({ timeout: 15_000 });

    await expect(ownerPage.getByText(limitedRoleCode)).toBeVisible({ timeout: 15_000 });

    await ownerPage.goto('/dashboard');
    await ownerPage.getByRole('button', { name: 'Đăng xuất' }).click();
    await ownerPage.waitForURL('**/login', { timeout: 15_000 });
    await ownerContext.close();

    const secondContext = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const secondPage = await secondContext.newPage();
    await uiLogin(secondPage, secondEmail, secondPassword);

    await secondPage.goto('/users');
    await expect(secondPage.getByRole('heading', { name: 'Nhân viên' })).toBeVisible();
    await expect(secondPage.getByText('Bạn không có quyền truy cập')).not.toBeVisible();

    await secondPage.goto('/customers');
    await expect(secondPage.getByText('Bạn không có quyền truy cập')).toBeVisible();

    await secondContext.close();
  });

  // ============================================================
  test('CASE 3 — Owner adds customer:view to the role (keeping user:view); after re-login the second user gains Customers access', async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const ownerPage = await ownerContext.newPage();
    await uiLogin(ownerPage, fixtures.adminEmail, fixtures.adminPassword);

    await ownerPage.goto(`/roles/${limitedRoleId}`);
    await expect(
      ownerPage.getByRole('checkbox', { name: 'Xem nhân viên (user:view)' }),
    ).toBeChecked();

    await ownerPage.getByRole('checkbox', { name: 'Xem khách hàng (customer:view)' }).click();
    await ownerPage.getByRole('button', { name: 'Lưu quyền' }).click();
    await expect(ownerPage.getByText(/Đã lưu quyền/)).toBeVisible({ timeout: 15_000 });

    await ownerPage.reload();
    await expect(
      ownerPage.getByRole('checkbox', { name: 'Xem nhân viên (user:view)' }),
    ).toBeChecked();
    await expect(
      ownerPage.getByRole('checkbox', { name: 'Xem khách hàng (customer:view)' }),
    ).toBeChecked();
    await ownerContext.close();

    // §11/§18 — the mutation bumped every role-holder's permissionVersion (incl. the second user);
    // any session they had is stale by design. Re-login through the real UI to observe the new
    // effective permission set — not treated as a defect.
    const secondContext = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const secondPage = await secondContext.newPage();
    await uiLogin(secondPage, secondEmail, secondPassword);

    await secondPage.goto('/users');
    await expect(secondPage.getByRole('heading', { name: 'Nhân viên' })).toBeVisible();

    await secondPage.goto('/customers');
    await expect(secondPage.getByRole('heading', { name: 'Khách hàng' })).toBeVisible();
    await expect(secondPage.getByText('Bạn không có quyền truy cập')).not.toBeVisible();

    await secondContext.close();
  });

  // ============================================================
  test('CASE 4 — Owner removes the role from the second user via UI; both permissions are revoked after re-login', async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const ownerPage = await ownerContext.newPage();
    await uiLogin(ownerPage, fixtures.adminEmail, fixtures.adminPassword);

    await ownerPage.goto(`/users/${secondUserId}`);
    await ownerPage.getByRole('button', { name: `Gỡ vai trò ${limitedRoleCode}` }).click();
    const dialog = ownerPage.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Gỡ vai trò' }).click();
    await expect(dialog).toBeHidden();
    await expect(ownerPage.getByText('Chưa có vai trò nào được gán.')).toBeVisible();
    await ownerContext.close();

    const secondContext = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const secondPage = await secondContext.newPage();
    await uiLogin(secondPage, secondEmail, secondPassword);

    await secondPage.goto('/users');
    await expect(secondPage.getByText('Bạn không có quyền truy cập')).toBeVisible();

    await secondPage.goto('/customers');
    await expect(secondPage.getByText('Bạn không có quyền truy cập')).toBeVisible();

    await secondContext.close();
  });

  // ============================================================
  test("CASE 5 — Owner protection: stripping role:update from the owner's sole role-granting role is rejected", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const page = await context.newPage();
    await uiLogin(page, fixtures.adminEmail, fixtures.adminPassword);

    await page.goto('/roles');
    await page.getByPlaceholder('Tìm theo tên hoặc mã vai trò...').fill('owner');
    // Search is client-side and debounced (300ms, `SearchToolbar`) — clicking "Xem" immediately
    // after `.fill()` can race the still-unfiltered (multi-row) table, making the link ambiguous
    // (confirmed the hard way against real CI: "resolved to 2 elements"). Scoping to the row whose
    // own text actually contains "owner" both waits for the filter to settle (via locator retry)
    // and removes any ambiguity even if it doesn't.
    const ownerRow = page.getByRole('row').filter({ hasText: 'owner' });
    await expect(ownerRow).toHaveCount(1, { timeout: 5_000 });
    await ownerRow.getByRole('link', { name: 'Xem' }).click();
    await page.waitForURL(/\/roles\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    const roleUpdateCheckbox = page.getByRole('checkbox', { name: /role:update/ });
    await expect(roleUpdateCheckbox).toBeChecked();

    await roleUpdateCheckbox.click();
    await expect(roleUpdateCheckbox).not.toBeChecked();
    await page.getByRole('button', { name: 'Lưu quyền' }).click();

    // §7/§14 RBAC_006 — surfaced visibly, editor stays open (no navigation away, no dialog close).
    await expect(page.getByText(/role:update/)).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain('/roles/');

    // Reload — proves the backend actually rejected the mutation (not just an unsent client state).
    await page.reload();
    await expect(page.getByRole('checkbox', { name: /role:update/ })).toBeChecked();

    await context.close();
  });
});
