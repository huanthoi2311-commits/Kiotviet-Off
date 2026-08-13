import fs from 'fs';
import path from 'path';
import { chromium, request as playwrightRequest } from '@playwright/test';
import { backendBaseUrl, frontendBaseUrl, runId } from './support';

/**
 * T051.08 — Global Setup cho Release E2E.
 *
 * Hai việc, theo đúng T051.08 §4 (Fixture Strategy — "Prefer API/bootstrap fixture creation for
 * setup; UI for the user journey under test"):
 *
 * 1. BOOTSTRAP dữ liệu tiền đề (Category/Unit/Supplier/Warehouse/Product) qua API THẬT bằng
 *    token của First Admin đã có sẵn từ `docker compose`'s `bring-up` service (T051.04) — không
 *    lái trình duyệt để tạo dữ liệu chủ không phải trọng tâm của suite này, không tạo giá trị
 *    release. Kết quả ghi ra `.auth/fixtures.json` để `critical-path.spec.ts` đọc lại.
 *
 * 2. Đăng nhập qua UI THẬT (form đăng nhập thật, không mock) một lần, lưu `storageState` (cookie
 *    refresh-token) để các test còn lại khởi động đã đăng nhập sẵn — bản thân hành vi "đăng nhập
 *    thật" vẫn được kiểm chứng tường minh trong `critical-path.spec.ts`'s test đầu tiên (dùng
 *    session riêng, không tái dùng storageState này), file này chỉ tái dùng session CHO CÁC BƯỚC
 *    SAU để không phải đăng nhập lại nhiều lần.
 */

const FIXTURES_PATH = path.join(__dirname, '.auth', 'fixtures.json');
const STORAGE_STATE_PATH = path.join(__dirname, '.auth', 'storage-state.json');

interface ReleaseFixtures {
  runId: string;
  organizationSlug: string;
  adminEmail: string;
  adminPassword: string;
  branchId: string;
  branchName: string;
  warehouseId: string;
  warehouseName: string;
  supplierId: string;
  supplierName: string;
  categoryId: string;
  unitId: string;
  productId: string;
  productName: string;
  productSku: string;
}

async function apiLogin(
  organizationSlug: string,
  email: string,
  password: string,
): Promise<string> {
  const api = await playwrightRequest.newContext();
  // KHÔNG dùng `baseURL` của context + path bắt đầu bằng "/" — theo ngữ nghĩa WHATWG URL,
  // `new URL('/auth/login', 'http://host/api/v1')` cho ra `http://host/auth/login` (path bắt đầu
  // bằng "/" LUÔN thay thế toàn bộ path của base, xoá mất "/api/v1") — luôn ghép URL tuyệt đối.
  const res = await api.post(`${backendBaseUrl()}/auth/login`, {
    data: { organizationSlug, email, password },
  });
  if (!res.ok()) {
    throw new Error(
      `[T051.08 global-setup] Đăng nhập bootstrap thất bại (${res.status()}): ${await res.text()}`,
    );
  }
  const body = await res.json();
  await api.dispose();
  return body.data.accessToken as string;
}

export default async function globalSetup(): Promise<void> {
  const organizationSlug = process.env.RELEASE_E2E_ORG_SLUG ?? 'pos-erp-release-e2e';
  const adminEmail = process.env.RELEASE_E2E_ADMIN_EMAIL ?? 'admin@pos-erp-release-e2e.local';
  const adminPassword = process.env.RELEASE_E2E_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error(
      '[T051.08 global-setup] RELEASE_E2E_ADMIN_PASSWORD chưa được set — bắt buộc, không dùng giá trị mặc định cho mật khẩu.',
    );
  }

  const id = runId();
  process.env.RELEASE_E2E_RUN_ID = id;

  const accessToken = await apiLogin(organizationSlug, adminEmail, adminPassword);
  // KHÔNG dùng `baseURL` của context (xem ghi chú trong `apiLogin` ở trên) — mọi lời gọi dưới đây
  // đều ghép URL tuyệt đối qua `backendBaseUrl()`.
  const api = await playwrightRequest.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
  });
  const apiUrl = (p: string) => `${backendBaseUrl()}${p}`;

  // Branch: dùng branch mặc định do bootstrap First Admin (T051.04) tạo sẵn (code cố định "MAIN"
  // theo `FIRST_ADMIN_BRANCH_CODE` mặc định) — không tạo branch mới, tránh trùng lặp không cần
  // thiết với hạ tầng đã có.
  const branchesRes = await api.get(apiUrl('/branches'), { params: { limit: 1 } });
  if (!branchesRes.ok()) {
    throw new Error(
      `[T051.08 global-setup] Không đọc được danh sách Branch: ${await branchesRes.text()}`,
    );
  }
  const branches = (await branchesRes.json()).data.items as {
    id: string;
    name: string;
  }[];
  if (branches.length === 0) {
    throw new Error(
      '[T051.08 global-setup] Không tìm thấy Branch nào — bring-up (First Admin bootstrap) phải tạo sẵn 1 branch mặc định.',
    );
  }
  const branchId = branches[0].id;
  const branchName = branches[0].name;

  const warehouseName = `Kho Release E2E ${id}`;
  const warehouseRes = await api.post(apiUrl('/warehouses'), {
    data: { branchId, code: `RE2E-WH-${id}`, name: warehouseName },
  });
  if (!warehouseRes.ok()) {
    throw new Error(`[T051.08 global-setup] Tạo Warehouse thất bại: ${await warehouseRes.text()}`);
  }
  const warehouseId = (await warehouseRes.json()).data.id as string;

  const supplierName = `Nhà cung cấp Release E2E ${id}`;
  const supplierRes = await api.post(apiUrl('/suppliers'), {
    data: { code: `RE2E-NCC-${id}`, companyName: supplierName },
  });
  if (!supplierRes.ok()) {
    throw new Error(`[T051.08 global-setup] Tạo Supplier thất bại: ${await supplierRes.text()}`);
  }
  const supplierId = (await supplierRes.json()).data.id as string;

  const categoryRes = await api.post(apiUrl('/categories'), {
    data: { code: `RE2E-CAT-${id}`, name: `Danh mục Release E2E ${id}` },
  });
  if (!categoryRes.ok()) {
    throw new Error(`[T051.08 global-setup] Tạo Category thất bại: ${await categoryRes.text()}`);
  }
  const categoryId = (await categoryRes.json()).data.id as string;

  const unitRes = await api.post(apiUrl('/units'), {
    data: { code: `RE2E-UNIT-${id}`, name: 'Cái', symbol: 'cái' },
  });
  if (!unitRes.ok()) {
    throw new Error(`[T051.08 global-setup] Tạo Unit thất bại: ${await unitRes.text()}`);
  }
  const unitId = (await unitRes.json()).data.id as string;

  const productName = `Sản phẩm Release E2E ${id}`;
  const productRes = await api.post(apiUrl('/products'), {
    data: {
      type: 'STANDARD',
      categoryId,
      unitId,
      name: productName,
      costPrice: 80000,
      vat: 10,
      prices: [{ type: 'RETAIL', price: 100000 }],
    },
  });
  if (!productRes.ok()) {
    throw new Error(`[T051.08 global-setup] Tạo Product thất bại: ${await productRes.text()}`);
  }
  const product = (await productRes.json()).data as { id: string; sku: string };

  await api.dispose();

  const fixtures: ReleaseFixtures = {
    runId: id,
    organizationSlug,
    adminEmail,
    adminPassword,
    branchId,
    branchName,
    warehouseId,
    warehouseName,
    supplierId,
    supplierName,
    categoryId,
    unitId,
    productId: product.id,
    productName,
    productSku: product.sku,
  };
  fs.mkdirSync(path.dirname(FIXTURES_PATH), { recursive: true });
  fs.writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));

  // Đăng nhập qua UI THẬT một lần — lưu storageState (cookie refresh-token thật) để các test còn
  // lại (ngoại trừ test đăng nhập tường minh trong critical-path.spec.ts, tự đăng nhập độc lập
  // bằng session riêng) khởi động đã có phiên hợp lệ, không phải lặp lại form đăng nhập cho mỗi
  // test riêng lẻ.
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: frontendBaseUrl() });
  await page.goto('/login');
  await page.getByLabel('Mã tổ chức').fill(organizationSlug);
  await page.getByLabel('Email').fill(adminEmail);
  await page.getByLabel('Mật khẩu').fill(adminPassword);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  try {
    await page.waitForURL('**/dashboard', { timeout: 30_000 });
  } catch (err) {
    // T051.08 chẩn đoán tạm: global-setup tự quản lý browser/page, KHÔNG có trace/screenshot tự
    // động của Playwright test runner (chỉ áp dụng cho context của test thật) — chụp thủ công vào
    // đúng thư mục đã được upload làm artifact khi CI fail (`frontend/test-results/`, xem
    // `.github/workflows/release-e2e.yml`), và gộp alert lỗi (nếu có) + URL cuối cùng thẳng vào
    // message ném ra để thấy ngay trong log CI, không cần tải artifact riêng.
    const debugDir = path.join(__dirname, '..', '..', 'test-results');
    fs.mkdirSync(debugDir, { recursive: true });
    await page.screenshot({ path: path.join(debugDir, 'global-setup-login-timeout.png') });
    const alertText = await page
      .getByRole('alert')
      .allTextContents()
      .catch(() => []);
    throw new Error(
      `[T051.08 global-setup] Đăng nhập UI không tới /dashboard trong 30s. URL cuối: ${page.url()}. Alert trên trang: ${JSON.stringify(alertText)}. Lỗi gốc: ${(err as Error).message}`,
    );
  }
  await page.context().storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}

export { FIXTURES_PATH, STORAGE_STATE_PATH };
export type { ReleaseFixtures };
