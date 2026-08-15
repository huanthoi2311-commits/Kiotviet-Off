import fs from 'fs';
import { test, expect, type Page, type Response, type APIRequestContext } from '@playwright/test';
import { FIXTURES_PATH, ReleaseFixtures } from './global-setup';
import { backendBaseUrl, frontendBaseUrl, selectCombobox } from './support';

/**
 * T052.05C §19 — real-browser proof for Supplier Payment idempotency, against the real packaged
 * stack (no mocked network, no mocked backend business behavior — same convention as
 * `rbac-management.spec.ts`/`critical-path.spec.ts`). `test.describe.serial`: later CASEs build on
 * the debt pool established in `beforeAll`.
 */
test.describe.serial('T052.05C — Supplier Payment (real stack)', () => {
  test.describe.configure({ timeout: 150_000 });

  let fixtures: ReleaseFixtures;

  test.beforeAll(async ({ request }) => {
    fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf-8')) as ReleaseFixtures;
    // Establish a real debt pool for the fixture supplier (global-setup creates the supplier but
    // no debt) — one large received Purchase Order, real API calls, not UI-driven (not the focus
    // of this suite, same convention as global-setup itself).
    await createReceivedPurchaseOrder(request, fixtures, 10_000_000, 1);
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

  async function createReceivedPurchaseOrder(
    request: APIRequestContext,
    fx: ReleaseFixtures,
    quantity: number,
    unitCost: number,
  ): Promise<void> {
    const headers = { Authorization: `Bearer ${fx.adminAccessToken}` };
    const created = await request.post(`${backendBaseUrl()}/purchase-orders`, {
      headers,
      data: {
        branchId: fx.branchId,
        supplierId: fx.supplierId,
        items: [
          {
            productId: fx.productId,
            warehouseId: fx.warehouseId,
            quantity,
            unitCost,
          },
        ],
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const purchaseOrderId = (await created.json()).data.id as string;

    const approved = await request.patch(
      `${backendBaseUrl()}/purchase-orders/${purchaseOrderId}/approve`,
      { headers },
    );
    expect(approved.ok(), await approved.text()).toBeTruthy();

    const received = await request.patch(
      `${backendBaseUrl()}/purchase-orders/${purchaseOrderId}/receive`,
      { headers, data: { version: 1 } },
    );
    expect(received.ok(), await received.text()).toBeTruthy();
  }

  async function readSupplierBalance(
    request: APIRequestContext,
    fx: ReleaseFixtures,
    accessToken: string = fx.adminAccessToken,
  ): Promise<number> {
    const res = await request.get(`${backendBaseUrl()}/supplier-debt`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { supplierId: fx.supplierId, limit: 1 },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const items = (await res.json()).data.items as { balance: string }[];
    return items.length > 0 ? Number(items[0].balance) : 0;
  }

  async function openPaymentDialog(page: Page): Promise<void> {
    await page.goto(`/suppliers/${fixtures.supplierId}`);
    await page.getByRole('button', { name: 'Ghi nhận thanh toán' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  }

  // ============================================================
  test('CASE 1 — normal payment: submit through real UI, success, balance reduces exactly once', async ({
    browser,
    request,
  }) => {
    const context = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const page = await context.newPage();
    await uiLogin(page, fixtures.adminEmail, fixtures.adminPassword);

    const balanceBefore = await readSupplierBalance(request, fixtures);
    await openPaymentDialog(page);
    const dialog = page.getByRole('dialog');

    await selectCombobox(page, 'Chi nhánh', fixtures.branchName);
    await dialog.getByLabel('Số tiền').fill('150000');
    await dialog.getByRole('button', { name: 'Ghi nhận thanh toán' }).click();

    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText('Đã ghi nhận thanh toán')).toBeVisible();

    // Server-truth verification, not just optimistic client state.
    const balanceAfter = await readSupplierBalance(request, fixtures);
    expect(balanceBefore - balanceAfter).toBe(150000);

    // The Debt summary on the page itself also reflects the update without a manual reload
    // (query invalidation, T052.05C §16).
    await expect(page.getByText(String(balanceAfter))).toBeVisible({ timeout: 15_000 });

    await context.close();
  });

  // ============================================================
  test('CASE 2 — double submit: rapid duplicate for one logical intent creates exactly one Payment', async ({
    browser,
    request,
  }) => {
    const context = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const page = await context.newPage();
    await uiLogin(page, fixtures.adminEmail, fixtures.adminPassword);

    const balanceBefore = await readSupplierBalance(request, fixtures);
    await openPaymentDialog(page);
    const dialog = page.getByRole('dialog');

    await selectCombobox(page, 'Chi nhánh', fixtures.branchName);
    await dialog.getByLabel('Số tiền').fill('77000');

    // §8/§19 — the submit button is only `aria-disabled` while pending (not the real DOM
    // `disabled` attribute — a deliberate product choice, T052.05C §8: "do NOT rely on button
    // disabling as correctness"), so it stays genuinely clickable. Firing two clicks back-to-back
    // without awaiting between them is a real rapid-duplicate-submit, not a simulated one.
    const submitButton = dialog.getByRole('button', { name: 'Ghi nhận thanh toán' });
    await Promise.all([submitButton.click(), submitButton.click()]);

    await expect(dialog).toBeHidden({ timeout: 20_000 });

    const balanceAfter = await readSupplierBalance(request, fixtures);
    // Never 2×77000 — the backend idempotency layer is authoritative regardless of what the UI
    // managed to prevent.
    expect(balanceBefore - balanceAfter).toBe(77000);

    await context.close();
  });

  // ============================================================
  test('CASE 3 — response loss / same-key retry: dropped client response, retry recovers the original Payment (no duplicate)', async ({
    browser,
    request,
  }) => {
    const context = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const page = await context.newPage();
    await uiLogin(page, fixtures.adminEmail, fixtures.adminPassword);

    const balanceBefore = await readSupplierBalance(request, fixtures);
    await openPaymentDialog(page);
    const dialog = page.getByRole('dialog');

    await selectCombobox(page, 'Chi nhánh', fixtures.branchName);
    await dialog.getByLabel('Số tiền').fill('42000');

    // Let the FIRST supplier-payment request reach the REAL backend and complete for real
    // (`route.fetch()`), then drop the response before it reaches the page (`route.abort()`) —
    // simulates a lost/ambiguous response without mocking any business behavior. Every
    // subsequent request (the retry) passes through untouched.
    let interceptedFirst = false;
    await page.route('**/api/v1/supplier-payment', async (route) => {
      if (!interceptedFirst) {
        interceptedFirst = true;
        await route.fetch();
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    const submitButton = dialog.getByRole('button', { name: 'Ghi nhận thanh toán' });
    await submitButton.click();

    // The dropped response surfaces as a diagnosable error, dialog stays open and usable.
    await expect(dialog.locator('[data-slot="alert"]')).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toBeVisible();

    // Retry — same intent (nothing changed), same Idempotency-Key reused by design.
    await submitButton.click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText('Đã ghi nhận thanh toán')).toBeVisible();

    const balanceAfter = await readSupplierBalance(request, fixtures);
    // Exactly one Payment recovered/replayed — never 2×42000 despite the server having actually
    // processed the FIRST (dropped-response) request too.
    expect(balanceBefore - balanceAfter).toBe(42000);

    await context.close();
  });

  // ============================================================
  test('CASE 4 — changed intent: editing amount after a failed attempt sends a NEW Idempotency-Key', async ({
    browser,
    request,
  }) => {
    const context = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const page = await context.newPage();
    await uiLogin(page, fixtures.adminEmail, fixtures.adminPassword);

    const currentBalance = await readSupplierBalance(request, fixtures);
    await openPaymentDialog(page);
    const dialog = page.getByRole('dialog');
    await selectCombobox(page, 'Chi nhánh', fixtures.branchName);

    const capturedKeys: (string | null)[] = [];
    await page.route('**/api/v1/supplier-payment', async (route) => {
      capturedKeys.push(await route.request().headerValue('idempotency-key'));
      await route.continue();
    });

    // First attempt: a genuinely too-large amount — a REAL business rejection from the real
    // backend (SUPPLIER_DEBT_001), not a mocked/forced failure.
    await dialog.getByLabel('Số tiền').fill(String(currentBalance + 5_000_000));
    await dialog.getByRole('button', { name: 'Ghi nhận thanh toán' }).click();
    await expect(dialog.locator('[data-slot="alert"]')).toBeVisible({ timeout: 15_000 });

    // Correct the amount (a genuinely changed intent) and resubmit — succeeds for real.
    await dialog.getByLabel('Số tiền').fill('');
    await dialog.getByLabel('Số tiền').fill('33000');
    await dialog.getByRole('button', { name: 'Ghi nhận thanh toán' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    expect(capturedKeys).toHaveLength(2);
    expect(capturedKeys[0]).not.toBeNull();
    expect(capturedKeys[1]).not.toBeNull();
    expect(capturedKeys[1]).not.toBe(capturedKeys[0]);

    await context.close();
  });

  // ============================================================
  test('CASE 5 — concurrency/balance: a second payment intent after balance changes surfaces the business error and stays recoverable', async ({
    browser,
    request,
  }) => {
    const context = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const page = await context.newPage();
    await uiLogin(page, fixtures.adminEmail, fixtures.adminPassword);

    // Establish a small, exact-sized debt pool for this case, independent of whatever remains
    // from CASE 1-4's shared pool — deplete it to exactly zero with one real payment.
    await createReceivedPurchaseOrder(request, fixtures, 60_000, 1);
    const balanceBeforeDeplete = await readSupplierBalance(request, fixtures);

    await openPaymentDialog(page);
    const firstDialog = page.getByRole('dialog');
    await selectCombobox(page, 'Chi nhánh', fixtures.branchName);
    await firstDialog.getByLabel('Số tiền').fill(String(balanceBeforeDeplete));
    await firstDialog.getByRole('button', { name: 'Ghi nhận thanh toán' }).click();
    await expect(firstDialog).toBeHidden({ timeout: 15_000 });

    const balanceAfterDeplete = await readSupplierBalance(request, fixtures);
    expect(balanceAfterDeplete).toBe(0);

    // Second, genuinely NEW payment intent — balance has now changed (concurrently, from this
    // same test's own prior action, standing in for "changed since the form was opened") — any
    // positive amount must now be rejected by the real backend.
    await openPaymentDialog(page);
    const secondDialog = page.getByRole('dialog');
    await selectCombobox(page, 'Chi nhánh', fixtures.branchName);
    await secondDialog.getByLabel('Số tiền').fill('10000');
    await secondDialog.getByRole('button', { name: 'Ghi nhận thanh toán' }).click();

    await expect(secondDialog.locator('[data-slot="alert"]')).toBeVisible({ timeout: 15_000 });
    // Recoverable: dialog stays open, form state preserved, user can still Hủy safely.
    await expect(secondDialog).toBeVisible();
    await expect(secondDialog.getByLabel('Số tiền')).toHaveValue('10000');
    await secondDialog.getByRole('button', { name: 'Hủy' }).click();
    await expect(secondDialog).toBeHidden();

    const balanceUnchanged = await readSupplierBalance(request, fixtures);
    expect(balanceUnchanged).toBe(0);

    await context.close();
  });
});
