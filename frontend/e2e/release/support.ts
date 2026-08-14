import { Page, expect } from '@playwright/test';

/**
 * T051.08 — helper dùng chung cho suite Release E2E.
 */

export function backendBaseUrl(): string {
  return process.env.RELEASE_E2E_API_URL ?? 'http://localhost:3000/api/v1';
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
