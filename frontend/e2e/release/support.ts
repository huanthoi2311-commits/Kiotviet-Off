import { Page, expect, request as playwrightRequest } from '@playwright/test';

/**
 * T051.08 — helper dùng chung cho suite Release E2E.
 */

export function backendBaseUrl(): string {
  return process.env.RELEASE_E2E_API_URL ?? 'http://localhost:3000/api/v1';
}

// T053.03 (Login Throttle Stabilization) — CÙNG budget throttle /auth/login (5 lần/60s/IP,
// auth.controller.ts) dùng chung trên toàn bộ IP runner CI cho MỌI lần đăng nhập (UI lẫn API)
// trong suite Release E2E — hằng số này là NGUỒN DUY NHẤT, các helper login khác (UI-based, vd
// user-management.spec.ts/rbac-management.spec.ts) đã tự có bản sao cùng giá trị từ trước, không
// đổi ở đây (không đụng code đang chạy đúng) — chỉ những lời gọi API-based MỚI (global-setup.ts,
// entitlement.spec.ts) dùng `apiLoginWithRetry()` bên dưới.
export const LOGIN_THROTTLE_MAX_ATTEMPTS = 5;
export const LOGIN_THROTTLE_BACKOFF_MS = 15_000;

export interface ApiLoginResult {
  accessToken: string;
  refreshToken?: string;
}

/**
 * `POST /auth/login` qua API thật, retry-với-backoff CHỈ cho HTTP 429 (throttle thật đang hoạt
 * động đúng thiết kế, không phải lỗi sản phẩm — xử lý như 1 client thật cần tôn trọng rate-limit,
 * không né tránh/vô hiệu hóa). Lỗi xác thực THẬT (401 sai email/mật khẩu, tài khoản khoá...) ném
 * NGAY, không retry — không được che giấu 1 thất bại xác thực thật sau vỏ bọc "đang chờ throttle".
 * Không log giá trị `password` — chỉ log lại nội dung PHẢN HỒI từ server (không echo lại input).
 */
export async function apiLoginWithRetry(
  organizationSlug: string,
  email: string,
  password: string,
): Promise<ApiLoginResult> {
  for (let attempt = 1; attempt <= LOGIN_THROTTLE_MAX_ATTEMPTS; attempt += 1) {
    const api = await playwrightRequest.newContext();
    const res = await api.post(`${backendBaseUrl()}/auth/login`, {
      data: { organizationSlug, email, password },
    });

    if (res.status() === 429) {
      await api.dispose();
      if (attempt === LOGIN_THROTTLE_MAX_ATTEMPTS) {
        throw new Error(
          `[apiLoginWithRetry] /auth/login vẫn bị throttle (429) sau ${LOGIN_THROTTLE_MAX_ATTEMPTS} lần retry-với-backoff (organizationSlug=${organizationSlug})`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, LOGIN_THROTTLE_BACKOFF_MS));
      continue;
    }

    if (!res.ok()) {
      const body = await res.text();
      await api.dispose();
      throw new Error(
        `[apiLoginWithRetry] Đăng nhập thất bại (status ${res.status()}, organizationSlug=${organizationSlug}): ${body}`,
      );
    }

    const body = (await res.json()).data as ApiLoginResult;
    await api.dispose();
    return body;
  }
  /* istanbul ignore next -- vòng lặp luôn return hoặc throw ở trên */
  throw new Error('[apiLoginWithRetry] unreachable');
}

export function frontendBaseUrl(): string {
  return process.env.RELEASE_E2E_BASE_URL ?? 'http://localhost:3001';
}

/** Prefix duy nhất cho mỗi lần chạy — tránh đụng độ code/slug nếu chạy lại trên môi trường có
 * sẵn dữ liệu (T051.08 §13, test isolation). */
export function runId(): string {
  return process.env.RELEASE_E2E_RUN_ID ?? `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/**
 * Chọn 1 option trong combobox base-ui/react (`role="combobox"` trigger + `role="option"` popup
 * item) — pattern DUY NHẤT dùng cho mọi select trong toàn bộ frontend (Chi nhánh/Nhà cung cấp/
 * Sản phẩm/Kho/Phương thức thanh toán/...), xác nhận qua chính test nội bộ của app
 * (`purchase-order-form.test.tsx`). KHÔNG phải native `<select>`.
 */
export async function selectCombobox(
  page: Page,
  comboboxName: string | RegExp,
  optionName: string | RegExp,
): Promise<void> {
  await page.getByRole('combobox', { name: comboboxName }).click();
  await page.getByRole('option', { name: optionName }).click();
}

/**
 * Xác nhận 1 hành động vòng đời (Duyệt/Xác nhận nhận hàng/Hủy/Gửi duyệt/Hoàn tất) — click nút
 * trigger trên trang, đợi dialog xuất hiện, click nút xác nhận BÊN TRONG dialog (tên nút thường
 * TRÙNG với nút trigger, nên bắt buộc phải scope vào dialog — xem purchase-order-detail.test.tsx/
 * sales-return-action-dialog.tsx).
 */
export async function confirmLifecycleAction(
  page: Page,
  triggerName: string | RegExp,
  confirmName: string | RegExp,
): Promise<void> {
  await page.getByRole('button', { name: triggerName }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: confirmName }).click();
  await expect(dialog).toBeHidden();
}

export interface InventoryQuantity {
  quantity: number;
}

/**
 * Đọc tồn kho THẬT qua API (không qua UI) — đúng phạm vi T051.08 §4: "direct DB/API assertions
 * only for final system invariants where UI does not expose a reliable verification". UI `/inventory`
 * ĐƯỢC dùng ở ít nhất 1 điểm trong suite để chứng minh UI hiển thị đúng, nhưng các phép so sánh
 * delta lặp lại (trước/sau mỗi bước) dùng API cho chính xác/ổn định.
 */
export async function readInventoryQuantity(
  request: import('@playwright/test').APIRequestContext,
  accessToken: string,
  warehouseId: string,
  productId: string,
): Promise<number> {
  const res = await request.get(`${backendBaseUrl()}/inventory`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { warehouseId, productId, page: 1, limit: 1 },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const items = body.data.items as InventoryQuantity[];
  return items.length > 0 ? Number(items[0].quantity) : 0;
}
