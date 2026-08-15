import { OrganizationPlan } from '../../../organization/domain/entities/organization.entity';
import { COMMERCIAL_FEATURES, CommercialFeature } from './commercial-features';

/**
 * T053.03 §2 — Ma trận Plan Entitlement V1 CHÍNH XÁC theo Architect cung cấp. Đây là default policy
 * DUY NHẤT — không nơi nào khác được định nghĩa lại. Mọi thay đổi ma trận này PHẢI đi qua Architect,
 * không suy diễn/mở rộng tự ý.
 */
export const PLAN_ENTITLEMENTS: Readonly<
  Record<OrganizationPlan, ReadonlySet<CommercialFeature>>
> = {
  FREE: new Set<CommercialFeature>([
    'DASHBOARD',
    'PRODUCT_BASIC',
    'CUSTOMER_BASIC',
    'POS_SALES',
    'INVOICE_VIEW',
    'INVENTORY_BASIC',
  ]),
  TRIAL: new Set<CommercialFeature>([
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
  ]),
  BASIC: new Set<CommercialFeature>([
    'DASHBOARD',
    'PRODUCT_BASIC',
    'CUSTOMER_BASIC',
    'POS_SALES',
    'INVOICE_VIEW',
    'INVENTORY_BASIC',
    'PURCHASE',
    'SUPPLIER',
    'SALES_RETURN',
  ]),
  PRO: new Set<CommercialFeature>([
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
    'MULTI_BRANCH_ADVANCED',
  ]),
  ENTERPRISE: new Set<CommercialFeature>(COMMERCIAL_FEATURES),
};

/**
 * `overrides` là bản ghi thô đã parse (unknown key bị bỏ qua từ bước parse trước đó). Duyệt theo
 * COMMERCIAL_FEATURES cố định (không duyệt key thô của override) — đảm bảo override KHÔNG BAO GIỜ
 * đưa vào một feature code không tồn tại trong catalog (T053.03 §16).
 */
export function resolveEffectiveFeatures(
  plan: OrganizationPlan,
  overrides: Partial<Record<CommercialFeature, boolean>>,
): Set<CommercialFeature> {
  const defaults = PLAN_ENTITLEMENTS[plan] ?? new Set<CommercialFeature>();
  const effective = new Set<CommercialFeature>(defaults);
  for (const feature of COMMERCIAL_FEATURES) {
    if (feature in overrides) {
      if (overrides[feature]) {
        effective.add(feature);
      } else {
        effective.delete(feature);
      }
    }
  }
  return effective;
}
