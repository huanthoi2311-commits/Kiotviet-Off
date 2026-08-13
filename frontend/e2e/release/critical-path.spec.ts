import fs from 'fs';
import { test, expect, request as playwrightRequest, APIRequestContext } from '@playwright/test';
import { FIXTURES_PATH, ReleaseFixtures } from './global-setup';
import {
  backendBaseUrl,
  confirmLifecycleAction,
  readInventoryQuantity,
  selectCombobox,
} from './support';

/**
 * T051.08 — Minimal Real-Browser Release E2E — luồng nghiệp vụ trọng yếu V1.0.
 *
 * KHÔNG mock backend/network — chạy đối với stack Compose thật (T051.04): frontend/backend/
 * Postgres/Redis thật, khởi động TRƯỚC bởi CI (xem `.github/workflows/release-e2e.yml`) hoặc thủ
 * công (`docker compose -f docker-compose.yml -f docker-compose.override.yml up --wait`).
 *
 * `test.describe.serial` — các bước phụ thuộc lẫn nhau theo đúng vòng đời nghiệp vụ thật (PO phải
 * Receive xong mới có tồn kho để bán; Checkout phải thành công mới có Invoice để trả hàng) — nếu 1
 * bước fail, các bước sau tự động bị skip thay vì chạy tiếp trên trạng thái không hợp lệ.
 */
test.describe.serial('T051.08 — Critical Path (real stack)', () => {
  let fixtures: ReleaseFixtures;
  let api: APIRequestContext;
  let accessToken: string;

  let purchaseOrderId: string;
  let invoiceId: string;
  let invoiceCode: string;
  let salesReturnId: string;

  const RECEIVE_QUANTITY = 20;
  const SELL_QUANTITY = 3;
  const RETURN_QUANTITY = 1;

  test.beforeAll(async () => {
    fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf-8')) as ReleaseFixtures;

    // KHÔNG dùng `baseURL` context + path bắt đầu bằng "/" — xem ghi chú trong `global-setup.ts`
    // (WHATWG URL: path bắt đầu bằng "/" thay thế toàn bộ path của baseURL, xoá mất "/api/v1").
    api = await playwrightRequest.newContext();
    const loginRes = await api.post(`${backendBaseUrl()}/auth/login`, {
      data: {
        organizationSlug: fixtures.organizationSlug,
        email: fixtures.adminEmail,
        password: fixtures.adminPassword,
      },
    });
    expect(loginRes.ok()).toBeTruthy();
    accessToken = (await loginRes.json()).data.accessToken;
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  // ============================================================
  test('1. Đăng nhập qua UI thật đạt Dashboard', async ({ browser }) => {
    // Session riêng, KHÔNG dùng storageState mặc định của config — chứng minh chính hành vi đăng
    // nhập qua UI thật (form thật, JWT/session thật), không tái dùng phiên đã đăng nhập sẵn.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/login');
    await page.getByLabel('Mã tổ chức').fill(fixtures.organizationSlug);
    await page.getByLabel('Email').fill(fixtures.adminEmail);
    await page.getByLabel('Mật khẩu').fill(fixtures.adminPassword);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.waitForURL('**/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await context.close();
  });

  // ============================================================
  test('2. Purchase Order: create → Duyệt → Xác nhận nhận hàng qua UI — tồn kho tăng đúng 1 lần', async ({
    page,
  }) => {
    const before = await readInventoryQuantity(
      api,
      accessToken,
      fixtures.warehouseId,
      fixtures.productId,
    );

    await page.goto('/purchase-orders/new');
    await selectCombobox(page, 'Chi nhánh', fixtures.branchName);
    await selectCombobox(page, 'Nhà cung cấp', fixtures.supplierName);
    await selectCombobox(page, 'Sản phẩm', `${fixtures.productName} (${fixtures.productSku})`);
    await selectCombobox(page, 'Kho nhận hàng', fixtures.warehouseName);
    await page.getByLabel('Số lượng').fill(String(RECEIVE_QUANTITY));
    await page.getByLabel('Đơn giá').fill('50000');

    await page.getByRole('button', { name: 'Tạo đơn nhập hàng' }).click();
    await page.waitForURL(/\/purchase-orders\/[0-9a-f-]{36}$/);
    purchaseOrderId = page.url().split('/purchase-orders/')[1];
    expect(purchaseOrderId).toMatch(/^[0-9a-f-]{36}$/);

    await expect(page.getByText('Nháp')).toBeVisible();

    await confirmLifecycleAction(page, 'Duyệt', 'Duyệt');
    await expect(page.getByText('Đã duyệt')).toBeVisible();

    await confirmLifecycleAction(page, 'Xác nhận nhận hàng', 'Xác nhận nhận hàng');
    await expect(page.getByText('Đã nhận hàng')).toBeVisible();

    // Đọc tồn kho qua chính UI /inventory — chứng minh UI hiển thị đúng, không chỉ backend đúng.
    await page.goto('/inventory');
    await selectCombobox(page, 'Lọc theo kho', fixtures.warehouseName);
    await selectCombobox(
      page,
      'Lọc theo sản phẩm',
      `${fixtures.productName} (${fixtures.productSku})`,
    );
    const expectedAfterReceive = before + RECEIVE_QUANTITY;
    await expect(page.getByRole('row').filter({ hasText: fixtures.productName })).toContainText(
      String(expectedAfterReceive),
    );

    // Chứng minh delta CHÍNH XÁC qua API (§10 — bất biến nghiệp vụ quan trọng nhất của suite).
    const after = await readInventoryQuantity(
      api,
      accessToken,
      fixtures.warehouseId,
      fixtures.productId,
    );
    expect(after).toBe(expectedAfterReceive);
  });

  // ============================================================
  test('3. POS Checkout qua UI tạo đúng 1 Invoice — tồn kho giảm đúng 1 lần', async ({ page }) => {
    const before = await readInventoryQuantity(
      api,
      accessToken,
      fixtures.warehouseId,
      fixtures.productId,
    );

    await page.goto('/pos');
    await selectCombobox(page, 'Sản phẩm', `${fixtures.productName} (${fixtures.productSku})`);
    await page.locator('#cart-add-quantity').fill(String(SELL_QUANTITY));
    await page.getByRole('button', { name: 'Thêm vào giỏ' }).click();
    await expect(page.getByText(fixtures.productName).first()).toBeVisible();

    await selectCombobox(page, 'Chi nhánh', fixtures.branchName);
    await selectCombobox(page, 'Kho xuất hàng', fixtures.warehouseName);
    await selectCombobox(page, 'Phương thức thanh toán', 'Tiền mặt');

    const [checkoutResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/api/v1/checkout') && res.request().method() === 'POST' && res.ok(),
      ),
      page.getByRole('button', { name: 'Thanh toán' }).click(),
    ]);
    const checkoutBody = await checkoutResponse.json();
    invoiceId = checkoutBody.data.invoice.id;
    invoiceCode = checkoutBody.data.invoice.code;

    await expect(page.getByRole('heading', { name: 'Thanh toán thành công' })).toBeVisible();
    await expect(page.getByText(invoiceCode)).toBeVisible();

    const expectedAfterSale = before - SELL_QUANTITY;
    const after = await readInventoryQuantity(
      api,
      accessToken,
      fixtures.warehouseId,
      fixtures.productId,
    );
    expect(after).toBe(expectedAfterSale);
  });

  // ============================================================
  test('4. Invoice qua UI hiển thị đúng dữ liệu vừa tạo', async ({ page }) => {
    await page.goto(`/invoices/${invoiceId}`);
    await expect(page.getByText(invoiceCode)).toBeVisible();
    await expect(page.getByText(fixtures.productName)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Trả hàng' })).toBeVisible();
  });

  // ============================================================
  test('5. Sales Return qua UI (Xác nhận nhận hàng) hoàn tồn kho đúng 1 lần', async ({ page }) => {
    const before = await readInventoryQuantity(
      api,
      accessToken,
      fixtures.warehouseId,
      fixtures.productId,
    );

    await page.goto(`/invoices/${invoiceId}`);
    await page.getByRole('button', { name: 'Trả hàng' }).click();
    await page.waitForURL(/\/sales-returns\/new\?invoiceId=/);

    await selectCombobox(page, 'Dòng hàng', new RegExp(fixtures.productName));
    await page.locator('#item-quantity-0').fill(String(RETURN_QUANTITY));
    await selectCombobox(page, 'Kho nhận hàng trả', fixtures.warehouseName);

    await page.getByRole('button', { name: 'Tạo phiếu trả hàng' }).click();
    await page.waitForURL(/\/sales-returns\/[0-9a-f-]{36}$/);
    salesReturnId = page.url().split('/sales-returns/')[1];
    expect(salesReturnId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.getByText('Nháp')).toBeVisible();

    await confirmLifecycleAction(page, 'Gửi duyệt', 'Gửi duyệt');
    await expect(page.getByText('Chờ duyệt')).toBeVisible();

    await confirmLifecycleAction(page, 'Duyệt', 'Duyệt');
    await expect(page.getByText('Đã duyệt')).toBeVisible();

    // Transition duy nhất tạo hiệu ứng tồn kho (InventoryDomainService.increase(), xem
    // sales-return.service.ts) — bất biến quan trọng nhất của bước này.
    await confirmLifecycleAction(page, 'Xác nhận nhận hàng', 'Xác nhận nhận hàng');
    await expect(page.getByText('Đã nhận hàng')).toBeVisible();

    const expectedAfterReturn = before + RETURN_QUANTITY;
    const afterReceive = await readInventoryQuantity(
      api,
      accessToken,
      fixtures.warehouseId,
      fixtures.productId,
    );
    expect(afterReceive).toBe(expectedAfterReturn);

    // Hoàn tất vòng đời — KHÔNG ảnh hưởng tồn kho (chỉ receive() gọi InventoryDomainService),
    // chứng minh trạng thái cuối THẬT SỰ đạt được qua UI, không dừng giữa chừng.
    await confirmLifecycleAction(page, 'Hoàn tất', 'Hoàn tất');
    await expect(page.getByText('Hoàn tất')).toBeVisible();

    const afterComplete = await readInventoryQuantity(
      api,
      accessToken,
      fixtures.warehouseId,
      fixtures.productId,
    );
    expect(afterComplete).toBe(expectedAfterReturn);
  });

  // ============================================================
  test('6. Duplicate-submit: double-click Thanh toán không tạo 2 Invoice/Payment', async ({
    page,
  }) => {
    const invoiceIds: string[] = [];
    page.on('response', (response) => {
      if (
        response.url().includes('/api/v1/checkout') &&
        response.request().method() === 'POST' &&
        response.ok()
      ) {
        void response
          .json()
          .then((body) => {
            if (body?.data?.invoice?.id) invoiceIds.push(body.data.invoice.id);
          })
          .catch(() => undefined);
      }
    });

    await page.goto('/pos');
    await selectCombobox(page, 'Sản phẩm', `${fixtures.productName} (${fixtures.productSku})`);
    await page.locator('#cart-add-quantity').fill('1');
    await page.getByRole('button', { name: 'Thêm vào giỏ' }).click();
    await expect(page.getByText(fixtures.productName).first()).toBeVisible();

    await selectCombobox(page, 'Chi nhánh', fixtures.branchName);
    await selectCombobox(page, 'Kho xuất hàng', fixtures.warehouseName);

    const checkoutButton = page.getByRole('button', { name: 'Thanh toán' });
    // Click thật 2 lần liên tiếp, không đợi giữa 2 lần — đúng kịch bản double-click người dùng
    // thật. Guard client-side (`disabled`/`aria-disabled` khi `isSubmitting`) khiến lần click thứ
    // 2 thường KHÔNG gửi thêm request nào; nếu race vẫn lọt qua, `Idempotency-Key` (cùng 1 key cho
    // tới khi thành công mới đổi) đảm bảo backend REPLAY thay vì tạo Invoice thứ 2 — cùng 1 khoá
    // buộc bất kỳ request thứ 2 nào cũng trả về CHÍNH XÁC cùng invoice.id, không phải Invoice mới.
    await checkoutButton.click();
    await checkoutButton.click({ timeout: 2000 }).catch(() => undefined);

    await expect(page.getByRole('heading', { name: 'Thanh toán thành công' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect(invoiceIds.length).toBeGreaterThanOrEqual(1);
    expect(new Set(invoiceIds).size).toBe(1);

    const paymentsRes = await api.get(`${backendBaseUrl()}/payments?invoiceId=${invoiceIds[0]}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(paymentsRes.ok()).toBeTruthy();
    const payments = (await paymentsRes.json()).data as unknown[];
    expect(payments).toHaveLength(1);
  });

  // ============================================================
  test('7. Tenant smoke: Chi nhánh/Kho trong dropdown chỉ thuộc đúng tổ chức', async ({ page }) => {
    // Backend real-E2E (T051.06A/T051.06B) đã chứng minh đầy đủ việc từ chối cross-tenant
    // branchId/warehouseId ở tầng API với 2 tổ chức thật. Suite này KHÔNG dựng lại fixture tổ
    // chức thứ hai (không có cơ chế bootstrap tổ chức thứ hai qua HTTP trong V1 — tạo Organization
    // chỉ qua CLI bootstrap một lần cho toàn bộ database, không lặp lại được trong 1 lần chạy
    // stack — đúng ngoại lệ được phép ở T051.08 §11) — smoke test này chỉ xác nhận Ở TẦNG UI rằng
    // dropdown Chi nhánh/Kho chỉ liệt kê ĐÚNG các thực thể của tổ chức đang đăng nhập (không rò rỉ
    // danh sách toàn cục), bằng chính dữ liệu đã tạo trong suite.
    await page.goto('/purchase-orders/new');

    await page.getByRole('combobox', { name: 'Chi nhánh' }).click();
    const branchOptions = await page.getByRole('option').allTextContents();
    expect(branchOptions).toEqual([fixtures.branchName]);
    await page.keyboard.press('Escape');

    await page.getByRole('combobox', { name: 'Kho nhận hàng' }).click();
    const warehouseOptions = await page.getByRole('option').allTextContents();
    expect(warehouseOptions).toEqual([fixtures.warehouseName]);
    await page.keyboard.press('Escape');
  });
});
