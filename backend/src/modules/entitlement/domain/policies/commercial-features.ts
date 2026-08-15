/**
 * T053.03 — Danh mục tập trung các CommercialFeature (tính năng thương mại). Đây là "WHICH feature
 * a Plan may use" — khác hoàn toàn RBAC Permission ("WHO may act"). Không module nào được tự định
 * nghĩa feature code rải rác — mọi nơi cần biết "feature X có tồn tại không" PHẢI đọc từ đây.
 *
 * 11/15 mã map trực tiếp tới route/module nghiệp vụ đã tồn tại thật (xác nhận qua audit T053.03 §1).
 * 4 mã (DASHBOARD, API_ACCESS, BACKUP_RESTORE_ADMIN, MULTI_BRANCH_ADVANCED) CHƯA có bất kỳ enforcement
 * surface nào trong backend hiện tại (không controller/guard nào dùng) — đăng ký ở đây theo đúng
 * ma trận Architect §2 cung cấp, KHÔNG phải tự bịa business logic, cùng tiền lệ với PERMISSION_CATALOG
 * (đã có nhiều permission code như `webhook:*`/`expense:*` chưa có controller nào dùng).
 */
export const COMMERCIAL_FEATURES = [
  'DASHBOARD',
  'PRODUCT_BASIC',
  'CUSTOMER_BASIC',
  'POS_SALES',
  'INVOICE_VIEW',
  'INVENTORY_BASIC',
  'PURCHASE',
  'SUPPLIER',
  'SALES_RETURN',
  'USER_MANAGEMENT',
  'RBAC_MANAGEMENT',
  'ADVANCED_REPORTS',
  'API_ACCESS',
  'BACKUP_RESTORE_ADMIN',
  'MULTI_BRANCH_ADVANCED',
] as const;

export type CommercialFeature = (typeof COMMERCIAL_FEATURES)[number];

const COMMERCIAL_FEATURE_SET: ReadonlySet<string> = new Set(
  COMMERCIAL_FEATURES,
);

export function isCommercialFeature(
  value: unknown,
): value is CommercialFeature {
  return typeof value === 'string' && COMMERCIAL_FEATURE_SET.has(value);
}
