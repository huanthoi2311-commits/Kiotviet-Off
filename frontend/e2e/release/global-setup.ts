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
  const api = await playwrightRequest.newContext({ baseURL: backendBaseUrl() });
  const res = await api.post('/auth/login', {
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
  const api = await playwrightRequest.newContext({
    baseURL: backendBaseUrl(),
    extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
  });

  // Branch: dùng branch mặc định do bootstrap First Admin (T051.04) tạo sẵn (code cố định "MAIN"
  // theo `FIRST_ADMIN_BRANCH_CODE` mặc định) — không tạo branch mới, tránh trùng lặp không cần
  // thiết với hạ tầng đã có.
  const branchesRes = await api.get('/branches', { params: { limit: 1 } });
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
  const warehouseRes = await api.post('/warehouses', {
    data: { branchId, code: `RE2E-WH-${id}`, name: warehouseName },
  });
  if (!warehouseRes.ok()) {
    throw new Error(`[T051.08 global-setup] Tạo Warehouse thất bại: ${await warehouseRes.text()}`);
  }
  const warehouseId = (await warehouseRes.json()).data.id as string;

  const supplierName = `Nhà cung cấp Release E2E ${id}`;
  const supplierRes = await api.post('/suppliers', {
    data: { code: `RE2E-NCC-${id}`, companyName: supplierName },
  });
  if (!supplierRes.ok()) {
    throw new Error(`[T051.08 global-setup] Tạo Supplier thất bại: ${await supplierRes.text()}`);
  }
  const supplierId = (await supplierRes.json()).data.id as string;

  const categoryRes = await api.post('/categories', {
    data: { code: `RE2E-CAT-${id}`, name: `Danh mục Release E2E ${id}` },
  });
  if (!categoryRes.ok()) {
    throw new Error(`[T051.08 global-setup] Tạo Category thất bại: ${await categoryRes.text()}`);
  }
  const categoryId = (await categoryRes.json()).data.id as string;

  const unitRes = await api.post('/units', {
    data: { code: `RE2E-UNIT-${id}`, name: 'Cái', symbol: 'cái' },
  });
  if (!unitRes.ok()) {
    throw new Error(`[T051.08 global-setup] Tạo Unit thất bại: ${await unitRes.text()}`);
  }
  const unitId = (await unitRes.json()).data.id as string;

  const productName = `Sản phẩm Release E2E ${id}`;
  const productRes = await api.post('/products', {
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
  await page.waitForURL('**/dashboard');
  await page.context().storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}

export { FIXTURES_PATH, STORAGE_STATE_PATH };
export type { ReleaseFixtures };
