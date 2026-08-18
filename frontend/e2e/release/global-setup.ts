import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { request as playwrightRequest } from '@playwright/test';
import { apiLoginWithRetry, backendBaseUrl, runId } from './support';

const REPO_ROOT = path.resolve(__dirname, '../../..');

/**
 * T051.08 — Global Setup cho Release E2E.
 *
 * T053.03 (post-T053.02A) — Architect Decision "Release Fixture-Org Rework". Entitlement
 * enforcement là THẬT từ T053.03: Organization bootstrap (do `docker compose`'s `bring-up` tạo,
 * T051.04) mãi mãi ở plan FREE — KHÔNG được nâng cấp chỉ để test chạy qua (§1/§9 Architect
 * Decision). Nhưng USER_MANAGEMENT/RBAC_MANAGEMENT/SUPPLIER/PURCHASE đều KHÔNG nằm trong FREE, nên
 * cả 4 spec Release E2E có từ trước (critical-path/user-management/rbac-management/
 * supplier-payment) đều cần một Organization ĐÃ ĐƯỢC CẤP QUYỀN thương mại, không thể tiếp tục dùng
 * trực tiếp Organization bootstrap để tạo Supplier/Warehouse/Product/User/Role nữa.
 *
 * 2 Organization TÁCH BIỆT, không bao giờ trộn lẫn (Architect Decision §1/§7):
 *
 *   BOOTSTRAP ORGANIZATION — Organization đầu tiên do bring-up tạo. LUÔN giữ FREE. Vai trò DUY
 *   NHẤT trong file này: làm bệ phóng để lấy danh tính Platform Admin đầu tiên qua CLI production
 *   thật (T053.02A). Không dùng để tạo bất kỳ Supplier/Warehouse/Product/User/Role nào nữa — trước
 *   khi rời khỏi Organization này, có 1 bước CHỨNG MINH TƯỜNG MINH nó vẫn bị entitlement chặn thật
 *   (§9 Architect Decision — "FREE MUST REMAIN PROVABLY LOCKED"), không chỉ ngầm định.
 *
 *   RELEASE FIXTURE ORGANIZATION — Organization MỚI, tạo qua `POST /organizations` thật (route
 *   Platform Admin thật) với `subscription.plan = ENTERPRISE`. Đây là ENTERPRISE cho MỤC ĐÍCH HẠ
 *   TẦNG TEST (chia sẻ Supplier/Warehouse/Product cho nhiều spec khác nhau, không nên phụ thuộc ma
 *   trận entitlement đang được kiểm chứng ở CASE A-D riêng) — KHÔNG phải chính sách production, và
 *   KHÔNG che giấu/thay thế các Organization TRIAL/BASIC/PRO/ENTERPRISE mà `entitlement.spec.ts` tự
 *   tạo riêng để chứng minh ma trận entitlement thật.
 *
 * PLATFORM ACTOR (Platform Admin vừa promote) CHỈ dùng cho đúng 1 việc: `POST /organizations` tạo
 * Release Fixture Organization. Toàn bộ Branch/Warehouse/Supplier/Category/Unit/Product bên dưới
 * được tạo bởi TENANT ACTOR — Owner CỦA CHÍNH Release Fixture Organization vừa tạo — không phải
 * Platform Admin (Architect Decision §4 "Platform Admin must not become universal actor").
 *
 * `organizationSlug`/`adminEmail`/`adminPassword`/`adminAccessToken`/`branchId`/... (đặt tên GIỮ
 * NGUYÊN như trước — 4 spec Release E2E có từ trước chỉ đọc các tên trường này, không quan tâm
 * Organization cụ thể nào đứng sau) nay mô tả RELEASE FIXTURE ORGANIZATION, KHÔNG còn phải Organization
 * bootstrap thật nữa — danh tính bootstrap THẬT vẫn được giữ riêng, đặt tên tường minh
 * `bootstrapOrganizationSlug`/`bootstrapAdminEmail`/`bootstrapAdminPassword` (Architect Decision §6
 * — "không giấu ranh giới tenant sau tên biến chung chung").
 *
 * T051.08 (resume, round 2) — KHÔNG lưu `storageState` (xem lịch sử — refresh-token
 * rotation-on-every-use khiến file tĩnh chỉ dùng được đúng 1 lần). `critical-path.spec.ts` tự đăng
 * nhập lại qua API cho ĐÚNG lần chạy hiện tại — test 1 của nó vẫn là bằng chứng ĐĂNG NHẬP QUA UI
 * THẬT duy nhất/độc lập của suite, nay đăng nhập vào Release Fixture Organization thay vì bootstrap.
 */

const FIXTURES_PATH = path.join(__dirname, '.auth', 'fixtures.json');

interface ReleaseFixtures {
  runId: string;
  /** Danh tính Organization bootstrap THẬT (bring-up, T051.04) — LUÔN FREE, không dùng để tạo fixture nghiệp vụ. */
  bootstrapOrganizationSlug: string;
  bootstrapAdminEmail: string;
  bootstrapAdminPassword: string;
  /** Release Fixture Organization (ENTERPRISE, chỉ phục vụ hạ tầng test — xem doc-comment ở trên). */
  organizationSlug: string;
  adminEmail: string;
  adminPassword: string;
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

export default async function globalSetup(): Promise<void> {
  const bootstrapOrganizationSlug = process.env.RELEASE_E2E_ORG_SLUG ?? 'pos-erp-release-e2e';
  const bootstrapAdminEmail =
    process.env.RELEASE_E2E_ADMIN_EMAIL ?? 'admin@pos-erp-release-e2e.local';
  const bootstrapAdminPassword = process.env.RELEASE_E2E_ADMIN_PASSWORD;
  if (!bootstrapAdminPassword) {
    throw new Error(
      '[T051.08 global-setup] RELEASE_E2E_ADMIN_PASSWORD chưa được set — bắt buộc, không dùng giá trị mặc định cho mật khẩu.',
    );
  }

  const id = runId();
  process.env.RELEASE_E2E_RUN_ID = id;

  const apiUrl = (p: string) => `${backendBaseUrl()}${p}`;

  const bootstrapAccessToken = (
    await apiLoginWithRetry(bootstrapOrganizationSlug, bootstrapAdminEmail, bootstrapAdminPassword)
  ).accessToken;

  // Architect Decision §9 — "FREE MUST REMAIN PROVABLY LOCKED". Trước khi rời khỏi Organization
  // bootstrap, chứng minh TƯỜNG MINH nó vẫn bị entitlement chặn thật trên 1 route đại diện
  // (SUPPLIER) — không chỉ là giả định ngầm. Bootstrap admin có Role "owner" = TOÀN QUYỀN RBAC
  // (first-admin-initializer.ts), nên 403 ở đây CHỈ có thể do Entitlement, không phải RBAC.
  {
    const proofApi = await playwrightRequest.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${bootstrapAccessToken}` },
    });
    const proofRes = await proofApi.post(apiUrl('/suppliers'), {
      data: { code: `RE2E-FREE-LOCK-PROOF-${id}`, companyName: 'FREE Lock Proof' },
    });
    if (proofRes.status() !== 403) {
      throw new Error(
        `[T051.08 global-setup] FREE-lock proof thất bại — kỳ vọng 403 ENTITLEMENT_001 cho Organization bootstrap (FREE), nhận được ${proofRes.status()}: ${await proofRes.text()}`,
      );
    }
    const proofBody = await proofRes.json();
    if (proofBody.code !== 'ENTITLEMENT_001') {
      throw new Error(
        `[T051.08 global-setup] FREE-lock proof thất bại — kỳ vọng code ENTITLEMENT_001, nhận được ${proofBody.code}`,
      );
    }
    await proofApi.dispose();
  }

  // PLATFORM ACTOR step 1 — cơ chế production THẬT (T053.02A), không phải bypass test-only.
  // Idempotent — an toàn nếu bootstrap admin đã được promote từ 1 lần chạy trước.
  execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'docker-compose.yml',
      '-f',
      'docker-compose.override.yml',
      'run',
      '--rm',
      'bring-up',
      'npm',
      'run',
      'platform-admin:promote',
      '--',
      `--organization-slug=${bootstrapOrganizationSlug}`,
      `--email=${bootstrapAdminEmail}`,
    ],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  );

  // PLATFORM ACTOR step 2 — promotion thu hồi TOÀN BỘ session cũ (T053.02A) — `bootstrapAccessToken`
  // ở trên đã hỏng, PHẢI đăng nhập lại để nhận JWT isPlatformAdmin=true.
  const platformActorToken = (
    await apiLoginWithRetry(bootstrapOrganizationSlug, bootstrapAdminEmail, bootstrapAdminPassword)
  ).accessToken;

  // PLATFORM ACTOR step 3 — tạo Release Fixture Organization (ENTERPRISE, chỉ phục vụ hạ tầng
  // test — xem doc-comment đầu file) qua route Platform Admin thật.
  const organizationSlug = `pos-erp-release-e2e-fixture-${id}`;
  const adminEmail = `fixture-owner-${id}@pos-erp-release-e2e.local`;
  const adminPassword = `FixtureOwner@${id}`;
  const createOrgRes = await (
    await playwrightRequest.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${platformActorToken}` },
    })
  ).post(apiUrl('/organizations'), {
    data: {
      organization: { displayName: `Release E2E Fixture ${id}`, slug: organizationSlug },
      owner: { fullName: 'Release Fixture Owner', email: adminEmail, password: adminPassword },
      subscription: { plan: 'ENTERPRISE' },
    },
  });
  if (!createOrgRes.ok()) {
    throw new Error(
      `[T051.08 global-setup] Tạo Release Fixture Organization thất bại: ${await createOrgRes.text()}`,
    );
  }

  // TENANT ACTOR — Owner CỦA CHÍNH Release Fixture Organization, KHÔNG phải Platform Admin, dùng
  // cho toàn bộ fixture nghiệp vụ bên dưới (Architect Decision §4/§7 — tenant boundary nhất quán:
  // actor.organizationId/Supplier.organizationId/Warehouse.organizationId/Product.organizationId
  // đều phải cùng trỏ về Release Fixture Organization).
  const accessToken = (await apiLoginWithRetry(organizationSlug, adminEmail, adminPassword))
    .accessToken;
  const api = await playwrightRequest.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
  });

  // `createWithOwner()` (POST /organizations) KHÔNG tự tạo Branch (khác `initializeFirstAdmin()`
  // của bootstrap) — phải tạo tường minh.
  const branchName = `Chi nhánh Release E2E Fixture ${id}`;
  const branchRes = await api.post(apiUrl('/branches'), {
    data: { name: branchName },
  });
  if (!branchRes.ok()) {
    throw new Error(`[T051.08 global-setup] Tạo Branch thất bại: ${await branchRes.text()}`);
  }
  const branchId = (await branchRes.json()).data.id as string;

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
    bootstrapOrganizationSlug,
    bootstrapAdminEmail,
    bootstrapAdminPassword,
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
