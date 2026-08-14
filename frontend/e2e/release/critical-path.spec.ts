import fs from 'fs';
import {
  test,
  expect,
  request as playwrightRequest,
  APIRequestContext,
  BrowserContext,
  Page,
} from '@playwright/test';
import { FIXTURES_PATH, ReleaseFixtures } from './global-setup';
import {
  backendBaseUrl,
  confirmLifecycleAction,
  frontendBaseUrl,
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
  // T051.08 (resume) — MỘT context/page dùng chung xuyên suốt test 2-7, KHÔNG dùng fixture `page`
  // mặc định của Playwright (tạo context MỚI mỗi test, mỗi context tự đọc lại CÙNG MỘT file
  // storageState.json tĩnh rồi tự khôi phục phiên ĐỘC LẬP). Vì backend xoay vòng refresh token
  // thật ở mỗi lần dùng (rotation-on-every-use, xem AuthService), nhiều context độc lập cùng khôi
  // phục từ CÙNG một snapshot cookie sẽ ĐUA nhau: chỉ context đầu tiên xoay vòng thành công, mọi
  // context sau dùng token đã hết hạn/bị thu hồi → phiên không dùng được → trang trắng, treo chờ
  // phần tử không bao giờ xuất hiện — xác nhận qua CI thật (T051.08 resume): 2 test độc lập
  // (`/pos`, `/purchase-orders/new`) đều bị đúng triệu chứng này. `test.describe.serial` vốn mô
  // phỏng ĐÚNG 1 phiên người dùng liên tục — dùng 1 context/page DUY NHẤT xuyên suốt vừa khớp đúng
  // ngữ nghĩa đó, vừa loại bỏ hoàn toàn cuộc đua này.
  //
  // T051.08 (resume, round 2) — cùng một cơ chế rotation-on-every-use còn gây ra 1 biến thể race
  // KHÁC, giữa các LẦN CHẠY chứ không phải giữa các context trong CÙNG 1 lần: `beforeAll` trước
  // đây phục hồi phiên từ 1 file `storageState.json` TĨNH (ghi ra đúng 1 lần bởi `global-setup.ts`
  // khi bắt đầu toàn bộ run) — nếu `test.describe.serial` phải retry (vd test 4 fail, Playwright
  // chạy lại TOÀN BỘ khối kể cả `beforeAll`), lần retry lại phục hồi từ CHÍNH file đó — nhưng
  // refresh_token trong file đã bị dùng/thu hồi bởi phiên của LẦN CHẠY TRƯỚC (test 2-7 đã điều
  // hướng qua nhiều trang được bảo vệ, kích hoạt `useSessionRestore()` gọi `/auth/refresh` xoay
  // vòng token) → retry phục hồi thất bại âm thầm → trang trắng, treo chờ phần tử không bao giờ
  // xuất hiện — xác nhận qua CI thật: retry của test 2 timeout ở `selectCombobox` với lỗi "Target
  // page, context or browser has been closed". Fix: `beforeAll` KHÔNG còn phục hồi từ file tĩnh —
  // tự đăng nhập lại qua API (KHÔNG qua form UI — việc chứng minh form UI đã là trách nhiệm riêng
  // của test 1) mỗi lần chạy (kể cả retry), lấy đúng 1 refresh_token MỚI CHƯA TỪNG DÙNG cho riêng
  // lần chạy đó, rồi cấy vào `sharedContext` — đúng pattern Playwright khuyến nghị cho "API sign-in,
  // reuse in browser context" (không có static snapshot nào để retry vô tình dùng lại).
  let sharedContext: BrowserContext;
  let sharedPage: Page;

  let purchaseOrderId: string;
  let invoiceId: string;
  let invoiceCode: string;
  let salesReturnId: string;
  // T051.08 §9 — Q0, chốt MỘT LẦN trước khi bất kỳ test nào chạm vào tồn kho: mọi assertion
  // before/after theo từng bước (test 2/3/5) đã đủ chứng minh delta CỤC BỘ đúng, nhưng phương
  // trình tổng "Q3 = Q0 + nhận − bán + trả" (đối chiếu thẳng với điểm xuất phát thật, không qua
  // chuỗi suy diễn từng bước) là bằng chứng nghiệp vụ trung tâm — khẳng định lại ở cuối test 5.
  let initialInventory: number;

  const RECEIVE_QUANTITY = 20;
  const SELL_QUANTITY = 3;
  const RETURN_QUANTITY = 1;

  test.beforeAll(async ({ browser }) => {
    fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf-8')) as ReleaseFixtures;

    // Tái dùng token bootstrap của chính global-setup.ts thay vì tự đăng nhập THÊM một lần nữa —
    // /auth/login bị Throttle giới hạn 5 lần/60s; một lần đăng nhập thừa ở đây từng cộng dồn đủ
    // (cùng với login của global-setup + login UI thật của test 1) để chạm ThrottlerException thật
    // MỖI KHI test.describe.serial retry (toàn khối chạy lại từ đầu) — xác nhận qua CI thật
    // (T051.08 resume). `api` context không cần pre-auth: mọi lời gọi dưới đây (readInventoryQuantity,
    // v.v.) đều tự gắn header Authorization riêng qua `accessToken`.
    api = await playwrightRequest.newContext();
    accessToken = fixtures.adminAccessToken;

    initialInventory = await readInventoryQuantity(
      api,
      accessToken,
      fixtures.warehouseId,
      fixtures.productId,
    );

    // T051.08 (resume, round 2) — đăng nhập qua API cho ĐÚNG lần chạy này (kể cả khi đây là 1 lần
    // retry) — xem ghi chú dài ở khai báo `sharedContext` phía trên. `APIRequestContext` tự giữ
    // cookie jar riêng; `storageState()` của nó trả về đúng cookie `refresh_token` thật (đủ thuộc
    // tính httpOnly/secure/sameSite/path) mà backend vừa set qua response `/auth/login` — cấy
    // thẳng vào `sharedContext` bằng `addCookies()`, không tự dựng lại cookie object thủ công.
    //
    // KHÔNG dùng `baseURL` của context + path bắt đầu bằng "/" — theo ngữ nghĩa WHATWG URL,
    // `new URL('/auth/login', 'http://host/api/v1')` cho ra `http://host/auth/login` (path bắt đầu
    // bằng "/" LUÔN thay thế toàn bộ path của base, xoá mất "/api/v1") — cùng gotcha đã được ghi
    // chú/tránh ở `apiLogin()` (global-setup.ts) — luôn ghép URL tuyệt đối, không đặt `baseURL`.
    const loginApi = await playwrightRequest.newContext();
    const loginRes = await loginApi.post(`${backendBaseUrl()}/auth/login`, {
      data: {
        organizationSlug: fixtures.organizationSlug,
        email: fixtures.adminEmail,
        password: fixtures.adminPassword,
      },
    });
    if (!loginRes.ok()) {
      throw new Error(
        `[T051.08] Đăng nhập API cho sharedContext thất bại (${loginRes.status()}): ${await loginRes.text()}`,
      );
    }
    const loginState = await loginApi.storageState();
    await loginApi.dispose();

    // MỘT context/page dùng chung cho toàn bộ test 2-7 — xem ghi chú ở khai báo `sharedPage` phía
    // trên. `baseURL` KHÔNG được `browser.newContext()` tự kế thừa từ config (phải truyền tường
    // minh). `storageState: undefined` chặn kế thừa ngầm từ `playwright.release.config.ts` (không
    // còn file storageState tĩnh nào để kế thừa nữa) — cookie phiên được cấy tường minh ngay sau.
    sharedContext = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    await sharedContext.addCookies(loginState.cookies);
    sharedPage = await sharedContext.newPage();
    // Điều hướng 1 lần tới route được bảo vệ để kích hoạt `useSessionRestore()` (dashboard-shell.tsx)
    // xác lập access token trong bộ nhớ TRƯỚC KHI test 2 bắt đầu — không phụ thuộc test 2 tự vô
    // tình kích hoạt đúng lúc; khẳng định tường minh phiên đã sẵn sàng bằng chính heading Dashboard.
    await sharedPage.goto('/dashboard');
    await expect(sharedPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test.afterAll(async () => {
    await api.dispose();
    // Guard: nếu `beforeAll` throw TRƯỚC khi gán `sharedContext` (vd đăng nhập API thất bại),
    // `afterAll` vẫn chạy — không để lỗi teardown thứ cấp ("Cannot read properties of undefined")
    // che mất lỗi gốc thật sự đã khiến `beforeAll` thất bại.
    if (sharedContext) {
      await sharedContext.close();
    }
  });

  // T051.08 §14 — test 2-7 KHÔNG còn dùng fixture `page` mặc định của Playwright (context riêng
  // dùng chung, xem ghi chú ở khai báo `sharedPage`), nên KHÔNG còn được tự động chụp màn hình khi
  // fail (cơ chế `screenshot: 'only-on-failure'` chỉ áp dụng cho context do fixture tạo). Bù lại
  // thủ công ở đây để không mất bằng chứng chẩn đoán — test 1 (context riêng, tạo mới mỗi lần chạy
  // qua fixture `browser`) không bị ảnh hưởng, vẫn tự động chụp như trước.
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && sharedPage && !sharedPage.isClosed()) {
      const screenshot = await sharedPage.screenshot().catch(() => null);
      if (screenshot) {
        await testInfo.attach('shared-page-screenshot-on-failure', {
          body: screenshot,
          contentType: 'image/png',
        });
      }
    }
  });

  // ============================================================
  test('1. Auth baseline: unauth → /login, đăng nhập qua UI thật → /dashboard, refresh_token đúng thuộc tính, refresh giữ phiên', async ({
    browser,
  }) => {
    // Session riêng, KHÔNG dùng storageState mặc định của config — chứng minh chính hành vi đăng
    // nhập qua UI thật (form thật, JWT/session thật), không tái dùng phiên đã đăng nhập sẵn.
    //
    // `baseURL` KHÔNG được `browser.newContext()` tự kế thừa từ config như fixture `context`/`page`
    // mặc định của Playwright — phải truyền tường minh, nếu không `page.goto('/login')` không có
    // gốc để resolve.
    //
    // `storageState` NGƯỢC LẠI vẫn bị kế thừa từ `playwright.release.config.ts`'s `use.storageState`
    // dù gọi `browser.newContext()` thủ công không truyền gì, TRỪ KHI override tường minh bằng
    // `storageState: undefined` — sửa lỗi test-infra đã xác nhận (T051.08 resume): trước khi
    // global-setup từng đăng nhập thành công thật lần đầu tiên, file storageState.json rỗng/không
    // hợp lệ nên lỗi này chưa từng lộ ra; nay global-setup đăng nhập thành công thật, context
    // "riêng" ở đây từng vô tình kế thừa một phiên ĐÃ đăng nhập thật nếu không override tường minh.
    const context = await browser.newContext({
      baseURL: frontendBaseUrl(),
      storageState: undefined,
    });
    const page = await context.newPage();

    // Khẳng định context THẬT SỰ chưa có phiên nào — bằng chứng trực tiếp cho việc storageState đã
    // được vô hiệu hoá đúng cách, không chỉ suy luận gián tiếp qua hành vi điều hướng.
    expect((await context.cookies()).find((c) => c.name === 'refresh_token')).toBeUndefined();

    // Baseline #1 — unauthenticated: route được bảo vệ phải bật về /login (middleware.ts).
    await page.goto('/dashboard');
    await page.waitForURL('**/login', { timeout: 15_000 });

    // Baseline #2 — đăng nhập qua UI thật.
    await page.getByLabel('Mã tổ chức').fill(fixtures.organizationSlug);
    await page.getByLabel('Email').fill(fixtures.adminEmail);
    await page.getByLabel('Mật khẩu').fill(fixtures.adminPassword);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.waitForURL('**/dashboard', { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Baseline #3 — thuộc tính cookie thật đúng hợp đồng (T051.08B/C).
    const refreshCookie = (await context.cookies()).find((c) => c.name === 'refresh_token');
    expect(refreshCookie, 'refresh_token cookie phải tồn tại sau khi đăng nhập').toBeDefined();
    expect(refreshCookie?.httpOnly).toBe(true);
    expect(refreshCookie?.secure).toBe(false);
    expect(refreshCookie?.sameSite).toBe('Lax');
    expect(refreshCookie?.path).toBe('/');

    // Baseline #4 — refresh giữ được phiên (dùng chung cookie jar của chính page).
    const refreshRes = await page.request.post(`${backendBaseUrl()}/auth/refresh`);
    expect(
      refreshRes.ok(),
      `refresh thất bại: ${refreshRes.status()} ${await refreshRes.text()}`,
    ).toBeTruthy();
    const refreshBody = await refreshRes.json();
    expect(typeof refreshBody.data.accessToken).toBe('string');
    expect((refreshBody.data.accessToken as string).length).toBeGreaterThan(0);

    // Baseline #5 — dashboard vẫn còn truy cập được sau refresh (phiên vẫn hợp lệ, không chỉ quan
    // sát được 1 lần).
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await context.close();
  });

  // ============================================================
  test('2. Purchase Order: create → Duyệt → Xác nhận nhận hàng qua UI — tồn kho tăng đúng 1 lần', async () => {
    const page = sharedPage;
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

    await expect(page.getByText('Nháp', { exact: true })).toBeVisible();

    await confirmLifecycleAction(page, 'Duyệt', 'Duyệt');
    // {exact: true} bắt buộc — toast thành công "Đã duyệt đơn nhập hàng" (purchase-order-action-
    // dialog.tsx) chứa "Đã duyệt" như một CHUỖI CON, khiến getByText không-exact khớp NHẦM cả toast
    // lẫn field trạng thái thật (<dd>Đã duyệt</dd>) — xác nhận qua lỗi CI thật (strict mode
    // violation, T051.08 resume).
    await expect(page.getByText('Đã duyệt', { exact: true })).toBeVisible();

    await confirmLifecycleAction(page, 'Xác nhận nhận hàng', 'Xác nhận nhận hàng');
    await expect(page.getByText('Đã nhận hàng', { exact: true })).toBeVisible();

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
  test('3. POS Checkout qua UI tạo đúng 1 Invoice — tồn kho giảm đúng 1 lần', async () => {
    const page = sharedPage;
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
  test('4. Invoice qua UI hiển thị đúng dữ liệu vừa tạo', async () => {
    const page = sharedPage;
    await page.goto(`/invoices/${invoiceId}`);
    await expect(page.getByText(invoiceCode)).toBeVisible();
    await expect(page.getByText(fixtures.productName)).toBeVisible();
    // Trạng thái thanh toán THẬT SỰ đạt được (không chỉ trang tải được) — Checkout ở test 3 thanh
    // toán đủ 100% bằng tiền mặt, nên hoá đơn phải hiển thị đúng PAID, không phải trạng thái khác.
    await expect(page.getByText('PAID', { exact: true })).toBeVisible();
    // T051.08 (resume, round 3) — DOM thật render "Trả hàng" như `<Link>` (Base-UI PermissionButton
    // với `render={<Link .../>}`, xem invoice-detail.tsx) — role accessibility THẬT là `link`, không
    // phải `button`; đây là điều hướng sang trang khác, đúng ngữ nghĩa `<a href>`, không phải hành
    // động tại chỗ — xác nhận qua ARIA snapshot CI thật (T051.08D real-browser proof), KHÔNG phải
    // lỗi UI cần sửa.
    await expect(page.getByRole('link', { name: 'Trả hàng' })).toBeVisible();
  });

  // ============================================================
  test('5. Sales Return qua UI (Xác nhận nhận hàng) hoàn tồn kho đúng 1 lần', async () => {
    const page = sharedPage;
    const before = await readInventoryQuantity(
      api,
      accessToken,
      fixtures.warehouseId,
      fixtures.productId,
    );

    await page.goto(`/invoices/${invoiceId}`);
    await page.getByRole('link', { name: 'Trả hàng' }).click();
    await page.waitForURL(/\/sales-returns\/new\?invoiceId=/);

    await selectCombobox(page, 'Dòng hàng', new RegExp(fixtures.productName));
    await page.locator('#item-quantity-0').fill(String(RETURN_QUANTITY));
    await selectCombobox(page, 'Kho nhận hàng trả', fixtures.warehouseName);

    await page.getByRole('button', { name: 'Tạo phiếu trả hàng' }).click();
    await page.waitForURL(/\/sales-returns\/[0-9a-f-]{36}$/);
    salesReturnId = page.url().split('/sales-returns/')[1];
    expect(salesReturnId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.getByText('Nháp', { exact: true })).toBeVisible();

    await confirmLifecycleAction(page, 'Gửi duyệt', 'Gửi duyệt');
    // {exact: true} bắt buộc — cùng bug class đã ghi chú bên dưới (Đã duyệt): toast thành công
    // "Đã gửi phiếu chờ duyệt" chứa "Chờ duyệt" như một CHUỖI CON (không phân biệt hoa/thường ở
    // getByText mặc định), khiến match NHẦM cả toast lẫn field trạng thái thật (<dd>Chờ duyệt</dd>)
    // — xác nhận qua lỗi CI thật (strict mode violation, T051.08 resume round 3, lần đầu suite chạy
    // xa đủ tới bước này để lộ ra).
    await expect(page.getByText('Chờ duyệt', { exact: true })).toBeVisible();

    await confirmLifecycleAction(page, 'Duyệt', 'Duyệt');
    // {exact: true} bắt buộc — toast thành công "Đã duyệt đơn nhập hàng" (purchase-order-action-
    // dialog.tsx) chứa "Đã duyệt" như một CHUỖI CON, khiến getByText không-exact khớp NHẦM cả toast
    // lẫn field trạng thái thật (<dd>Đã duyệt</dd>) — xác nhận qua lỗi CI thật (strict mode
    // violation, T051.08 resume).
    await expect(page.getByText('Đã duyệt', { exact: true })).toBeVisible();

    // Transition duy nhất tạo hiệu ứng tồn kho (InventoryDomainService.increase(), xem
    // sales-return.service.ts) — bất biến quan trọng nhất của bước này.
    await confirmLifecycleAction(page, 'Xác nhận nhận hàng', 'Xác nhận nhận hàng');
    await expect(page.getByText('Đã nhận hàng', { exact: true })).toBeVisible();

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
    // {exact: true} bắt buộc — cùng bug class (xem "Chờ duyệt"/"Đã duyệt" ở trên): toast thành công
    // "Đã hoàn tất phiếu trả hàng" (sales-return-action-dialog.tsx) chứa "Hoàn tất" như một CHUỖI
    // CON — xác nhận qua nguồn (copy.successMessage cho action COMPLETE), không chờ CI lộ ra lần
    // nữa vì đã đủ bằng chứng nguồn cho đúng pattern đã lặp lại 3 lần trong cùng file này.
    await expect(page.getByText('Hoàn tất', { exact: true })).toBeVisible();

    const afterComplete = await readInventoryQuantity(
      api,
      accessToken,
      fixtures.warehouseId,
      fixtures.productId,
    );
    expect(afterComplete).toBe(expectedAfterReturn);

    // T051.08 §9 — phương trình tồn kho đầu-cuối, đối chiếu thẳng với Q0 (không qua chuỗi suy diễn
    // từng bước): Q3 = Q0 + nhận hàng − bán hàng + trả hàng.
    expect(afterComplete).toBe(
      initialInventory + RECEIVE_QUANTITY - SELL_QUANTITY + RETURN_QUANTITY,
    );
  });

  // ============================================================
  test('6. Duplicate-submit: double-click Thanh toán không tạo 2 Invoice/Payment', async () => {
    const page = sharedPage;
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
  test('7. Tenant smoke: Chi nhánh/Kho trong dropdown chỉ thuộc đúng tổ chức', async () => {
    const page = sharedPage;
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
