/**
 * T053.03 §3 — Danh mục CommercialFeature phía frontend, PHẢI khớp chính xác với backend
 * (`backend/src/modules/entitlement/domain/policies/commercial-features.ts`). Không tự thêm/bớt
 * ở đây — mọi thay đổi catalog đi qua backend trước.
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
