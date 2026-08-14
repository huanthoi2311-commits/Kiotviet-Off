import fs from 'fs';
import path from 'path';
import { request as playwrightRequest } from '@playwright/test';
import { backendBaseUrl, runId } from './support';

/**
 * T051.08 — Global Setup cho Release E2E.
 *
 * BOOTSTRAP dữ liệu tiền đề (Category/Unit/Supplier/Warehouse/Product) qua API THẬT bằng token
 * của First Admin đã có sẵn từ `docker compose`'s `bring-up` service (T051.04) — không lái trình
 * duyệt để tạo dữ liệu chủ không phải trọng tâm của suite này, không tạo giá trị release. Kết quả
 * ghi ra `.auth/fixtures.json` để `critical-path.spec.ts` đọc lại.
 *
 * T051.08 (resume, round 2) — KHÔNG còn đăng nhập UI + lưu `storageState` ở đây (như thiết kế ban
 * đầu). Dưới cơ chế refresh-token rotation-on-every-use, một file `storageState` tĩnh chỉ dùng
 * được ĐÚNG 1 LẦN: nếu `test.describe.serial` trong `critical-path.spec.ts` phải retry (toàn bộ
 * khối beforeAll/test chạy lại), lần phục hồi phiên thứ 2 từ CÙNG file sẽ nhận đúng refresh_token
 * đã bị dùng/thu hồi bởi lần chạy trước → phiên khôi phục thất bại âm thầm → trang trắng, treo chờ
 * phần tử không bao giờ xuất hiện — xác nhận qua CI thật ("Target page, context or browser has
 * been closed" khi retry test 2). `critical-path.spec.ts`'s `beforeAll` nay tự đăng nhập lại qua
 * API cho ĐÚNG lần chạy hiện tại (kể cả khi retry) thay vì phục hồi từ file — xem ghi chú ở đó.
 * Test 1 của `critical-path.spec.ts` vẫn là bằng chứng ĐĂNG NHẬP QUA UI THẬT duy nhất/độc lập của
 * suite (§5 "no mocked auth") — không đổi.
 */

const FIXTURES_PATH = path.join(__dirname, '.auth', 'fixtures.json');

interface ReleaseFixtures {
  runId: string;
  organizationSlug: string;
  adminEmail: string;
  adminPassword: string;
  // T051.08 (resume) — token bootstrap CÓ SẴN, chia sẻ lại cho critical-path.spec.ts's beforeAll
  // thay vì tự đăng nhập THÊM một lần nữa — endpoint /auth/login bị Throttle giới hạn 5 lần/60s
  // (auth.controller.ts); khi test.describe.serial retry (toàn bộ khối chạy lại từ đầu), một lần
  // đăng nhập THỪA ở đây từng cộng dồn đủ để chạm ThrottlerException thật (xác nhận qua CI thật,
  // T051.08 resume) — token này còn hạn đủ lâu (JWT_ACCESS_EXPIRES_IN=15m) cho toàn bộ suite.
  adminAccessToken: string;
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
    adminAccessToken: accessToken,
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
}

export { FIXTURES_PATH };
export type { ReleaseFixtures };
