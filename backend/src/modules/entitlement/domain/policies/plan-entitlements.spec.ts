import { OrganizationPlan } from '../../../organization/domain/entities/organization.entity';
import { COMMERCIAL_FEATURES, CommercialFeature } from './commercial-features';
import {
  PLAN_ENTITLEMENTS,
  resolveEffectiveFeatures,
} from './plan-entitlements';

describe('PLAN_ENTITLEMENTS (T053.03 §2 — ma trận Architect cung cấp chính xác)', () => {
  it('FREE — đúng tập enabled', () => {
    expect(Array.from(PLAN_ENTITLEMENTS.FREE).sort()).toEqual(
      [
        'DASHBOARD',
        'PRODUCT_BASIC',
        'CUSTOMER_BASIC',
        'POS_SALES',
        'INVOICE_VIEW',
        'INVENTORY_BASIC',
      ].sort(),
    );
    expect(PLAN_ENTITLEMENTS.FREE.has('USER_MANAGEMENT')).toBe(false);
    expect(PLAN_ENTITLEMENTS.FREE.has('RBAC_MANAGEMENT')).toBe(false);
    expect(PLAN_ENTITLEMENTS.FREE.has('SUPPLIER')).toBe(false);
  });

  it('TRIAL — đúng tập enabled (đầy đủ workflow trừ ADVANCED_REPORTS/API_ACCESS/BACKUP_RESTORE_ADMIN/MULTI_BRANCH_ADVANCED)', () => {
    expect(Array.from(PLAN_ENTITLEMENTS.TRIAL).sort()).toEqual(
      [
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
      ].sort(),
    );
  });

  it('BASIC — đúng tập enabled (không USER_MANAGEMENT/RBAC_MANAGEMENT)', () => {
    expect(Array.from(PLAN_ENTITLEMENTS.BASIC).sort()).toEqual(
      [
        'DASHBOARD',
        'PRODUCT_BASIC',
        'CUSTOMER_BASIC',
        'POS_SALES',
        'INVOICE_VIEW',
        'INVENTORY_BASIC',
        'PURCHASE',
        'SUPPLIER',
        'SALES_RETURN',
      ].sort(),
    );
    expect(PLAN_ENTITLEMENTS.BASIC.has('USER_MANAGEMENT')).toBe(false);
    expect(PLAN_ENTITLEMENTS.BASIC.has('RBAC_MANAGEMENT')).toBe(false);
  });

  it('PRO — đúng tập enabled (có USER_MANAGEMENT/RBAC_MANAGEMENT/ADVANCED_REPORTS/MULTI_BRANCH_ADVANCED, không API_ACCESS/BACKUP_RESTORE_ADMIN)', () => {
    expect(Array.from(PLAN_ENTITLEMENTS.PRO).sort()).toEqual(
      [
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
      ].sort(),
    );
    expect(PLAN_ENTITLEMENTS.PRO.has('API_ACCESS')).toBe(false);
    expect(PLAN_ENTITLEMENTS.PRO.has('BACKUP_RESTORE_ADMIN')).toBe(false);
  });

  it('ENTERPRISE — toàn bộ 15 feature hiện tại', () => {
    expect(Array.from(PLAN_ENTITLEMENTS.ENTERPRISE).sort()).toEqual(
      [...COMMERCIAL_FEATURES].sort(),
    );
    expect(PLAN_ENTITLEMENTS.ENTERPRISE.size).toBe(COMMERCIAL_FEATURES.length);
  });
});

describe('resolveEffectiveFeatures — override resolution (T053.03 §5/§16/§18)', () => {
  it('không override (object rỗng) => giữ nguyên default của Plan', () => {
    const result = resolveEffectiveFeatures('BASIC', {});
    expect(result).toEqual(new Set(PLAN_ENTITLEMENTS.BASIC));
  });

  it('override true bật 1 feature vốn KHÔNG có trong Plan', () => {
    const result = resolveEffectiveFeatures('BASIC', {
      USER_MANAGEMENT: true,
    });
    expect(result.has('USER_MANAGEMENT')).toBe(true);
    // Các feature khác không đổi
    expect(result.has('SUPPLIER')).toBe(true);
    expect(result.has('RBAC_MANAGEMENT')).toBe(false);
  });

  it('override false tắt 1 feature vốn CÓ trong Plan', () => {
    const result = resolveEffectiveFeatures('PRO', { SUPPLIER: false });
    expect(result.has('SUPPLIER')).toBe(false);
    expect(result.has('USER_MANAGEMENT')).toBe(true);
  });

  it('override không đưa thêm feature lạ vào effective set (chỉ duyệt COMMERCIAL_FEATURES cố định)', () => {
    const result = resolveEffectiveFeatures('FREE', {
      ...({ UNKNOWN_FEATURE: true } as any),
    });

    expect((result as Set<any>).has('UNKNOWN_FEATURE')).toBe(false);
  });

  it('Plan default policy (PLAN_ENTITLEMENTS) không bị mutate bởi resolve', () => {
    const before = new Set(PLAN_ENTITLEMENTS.BASIC);
    resolveEffectiveFeatures('BASIC', {
      SUPPLIER: false,
      USER_MANAGEMENT: true,
    });
    expect(PLAN_ENTITLEMENTS.BASIC).toEqual(before);
  });

  it.each(COMMERCIAL_FEATURES)(
    'ENTERPRISE luôn có %s dù overrides rỗng',
    (feature: CommercialFeature) => {
      const result = resolveEffectiveFeatures('ENTERPRISE', {});
      expect(result.has(feature)).toBe(true);
    },
  );

  it('mọi OrganizationPlan hợp lệ đều resolve được (không throw)', () => {
    const plans: OrganizationPlan[] = [
      'FREE',
      'TRIAL',
      'BASIC',
      'PRO',
      'ENTERPRISE',
    ];
    for (const plan of plans) {
      expect(() => resolveEffectiveFeatures(plan, {})).not.toThrow();
    }
  });
});
