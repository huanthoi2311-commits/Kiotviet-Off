import { CommercialFeature, isCommercialFeature } from './commercial-features';

/**
 * T053.03 §16 — Validate entitlementOverrides thô đọc từ DB:
 * - object shape (không phải mảng/chuỗi/số)
 * - key phải là CommercialFeature hợp lệ, value phải là boolean
 * - không nested data
 * - unknown feature key / giá trị sai kiểu => bị bỏ qua (reject), KHÔNG throw — 1 override hỏng
 *   không được làm sập toàn bộ request resolve entitlement (fail-closed về default của Plan cho
 *   riêng field đó, không phải fail toàn bộ)
 * - null/undefined => không override (dùng nguyên default Plan)
 */
export function parseEntitlementOverrides(
  raw: unknown,
): Partial<Record<CommercialFeature, boolean>> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return {};

  const result: Partial<Record<CommercialFeature, boolean>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isCommercialFeature(key) && typeof value === 'boolean') {
      result[key] = value;
    }
  }
  return result;
}
