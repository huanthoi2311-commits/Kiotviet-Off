import type { IEntitlementSubscriptionReader } from '../domain/repositories/entitlement-subscription-reader.interface';
import { EntitlementService } from './entitlement.service';

describe('EntitlementService (T053.03 §6/§27.8, T053.06F expiry soft-landing)', () => {
  let reader: jest.Mocked<IEntitlementSubscriptionReader>;
  let service: EntitlementService;

  beforeEach(() => {
    reader = { findByOrganizationId: jest.fn() };
    service = new EntitlementService(reader);
  });

  describe('hasFeature', () => {
    it('trả true cho feature nằm trong default của Plan', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'PRO',
        status: 'ACTIVE',
        expiredAt: null,
        entitlementOverrides: null,
      });
      await expect(
        service.hasFeature('org-1', 'RBAC_MANAGEMENT'),
      ).resolves.toBe(true);
    });

    it('trả false cho feature không nằm trong Plan', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'BASIC',
        status: 'ACTIVE',
        expiredAt: null,
        entitlementOverrides: null,
      });
      await expect(
        service.hasFeature('org-1', 'RBAC_MANAGEMENT'),
      ).resolves.toBe(false);
    });

    it('subscription NULL/missing => false (fail-closed, không phải unrestricted)', async () => {
      reader.findByOrganizationId.mockResolvedValue(null);
      await expect(service.hasFeature('org-1', 'DASHBOARD')).resolves.toBe(
        false,
      );
    });

    it('override true bật feature vốn bị Plan tắt', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'BASIC',
        status: 'ACTIVE',
        expiredAt: null,
        entitlementOverrides: { RBAC_MANAGEMENT: true },
      });
      await expect(
        service.hasFeature('org-1', 'RBAC_MANAGEMENT'),
      ).resolves.toBe(true);
    });

    it('override false tắt feature vốn Plan bật', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'PRO',
        status: 'ACTIVE',
        expiredAt: null,
        entitlementOverrides: { SUPPLIER: false },
      });
      await expect(service.hasFeature('org-1', 'SUPPLIER')).resolves.toBe(
        false,
      );
    });

    it('luôn tra cứu đúng organizationId truyền vào (không hard-code/không dùng org khác)', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'FREE',
        status: 'ACTIVE',
        expiredAt: null,
        entitlementOverrides: null,
      });
      await service.hasFeature('org-specific-id', 'DASHBOARD');
      expect(reader.findByOrganizationId).toHaveBeenCalledWith(
        'org-specific-id',
      );
    });
  });

  describe('getEffectiveFeatures', () => {
    it('subscription missing => [] rỗng (fail-closed)', async () => {
      reader.findByOrganizationId.mockResolvedValue(null);
      await expect(service.getEffectiveFeatures('org-1')).resolves.toEqual([]);
    });

    it('ENTERPRISE => đủ 15 feature hiện tại', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'ENTERPRISE',
        status: 'ACTIVE',
        expiredAt: null,
        entitlementOverrides: null,
      });
      const result = await service.getEffectiveFeatures('org-1');
      expect(result).toHaveLength(15);
    });

    it('entitlementOverrides hỏng (không phải object) => vẫn resolve an toàn theo default Plan', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'BASIC',
        status: 'ACTIVE',
        expiredAt: null,
        entitlementOverrides: 'corrupted-not-an-object',
      });
      const result = await service.getEffectiveFeatures('org-1');
      expect(result).toContain('SUPPLIER');
      expect(result).not.toContain('USER_MANAGEMENT');
    });

    it('TRIAL còn hạn => vẫn đủ 11 feature TRIAL (hành vi không đổi)', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'TRIAL',
        status: 'ACTIVE',
        expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        entitlementOverrides: null,
      });
      const result = await service.getEffectiveFeatures('org-1');
      expect(result).toHaveLength(11);
      expect(result).toContain('SUPPLIER');
    });
  });

  // U8/U9 (T053.06F §20) — TRIAL hết hạn resolve như FREE, không phải TRIAL, không rỗng toàn bộ.
  describe('TRIAL hết hạn — soft-landing về FREE (T053.06F Architect Decision §5)', () => {
    it('U8/U9 — persisted status=EXPIRED: mất hết feature chỉ-TRIAL, vẫn giữ base/FREE', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'TRIAL',
        status: 'EXPIRED',
        expiredAt: new Date('2026-01-01T00:00:00.000Z'),
        entitlementOverrides: null,
      });
      const result = await service.getEffectiveFeatures('org-1');
      expect(result.sort()).toEqual(
        [
          'DASHBOARD',
          'PRODUCT_BASIC',
          'CUSTOMER_BASIC',
          'POS_SALES',
          'INVOICE_VIEW',
          'INVENTORY_BASIC',
        ].sort(),
      );
      for (const feature of [
        'PURCHASE',
        'SUPPLIER',
        'SALES_RETURN',
        'USER_MANAGEMENT',
        'RBAC_MANAGEMENT',
      ] as const) {
        expect(result).not.toContain(feature);
      }
    });

    // U10 — request-time fail-safe: status VẪN 'ACTIVE' (scheduler chưa chạy) nhưng expiredAt đã
    // qua — vẫn phải resolve như đã hết hạn ngay lập tức, không đợi scheduler.
    it('U10 — ACTIVE nhưng quá hạn (scheduler CHƯA chạy) vẫn resolve như hết hạn ngay', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'TRIAL',
        status: 'ACTIVE',
        expiredAt: new Date('2020-01-01T00:00:00.000Z'),
        entitlementOverrides: null,
      });
      await expect(service.hasFeature('org-1', 'SUPPLIER')).resolves.toBe(
        false,
      );
      await expect(service.hasFeature('org-1', 'DASHBOARD')).resolves.toBe(
        true,
      );
    });

    it('hasFeature: DASHBOARD (base/FREE) vẫn true khi TRIAL đã hết hạn', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'TRIAL',
        status: 'EXPIRED',
        expiredAt: new Date('2026-01-01T00:00:00.000Z'),
        entitlementOverrides: null,
      });
      await expect(service.hasFeature('org-1', 'DASHBOARD')).resolves.toBe(
        true,
      );
    });

    // U15 — override cũ (từ trước khi hết hạn) từng bật 1 feature chỉ-TRIAL — KHÔNG được hồi
    // sinh feature đó sau khi hết hạn (khóa chính sách §5).
    it('U15 — entitlementOverrides cũ KHÔNG thể hồi sinh feature chỉ-TRIAL trên TRIAL đã hết hạn', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'TRIAL',
        status: 'EXPIRED',
        expiredAt: new Date('2026-01-01T00:00:00.000Z'),
        entitlementOverrides: { SUPPLIER: true, RBAC_MANAGEMENT: true },
      });
      const result = await service.getEffectiveFeatures('org-1');
      expect(result).not.toContain('SUPPLIER');
      expect(result).not.toContain('RBAC_MANAGEMENT');
    });

    it('override tắt 1 feature FREE-baseline trên TRIAL đã hết hạn vẫn có tác dụng bình thường', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'TRIAL',
        status: 'EXPIRED',
        expiredAt: new Date('2026-01-01T00:00:00.000Z'),
        entitlementOverrides: { DASHBOARD: false },
      });
      await expect(service.hasFeature('org-1', 'DASHBOARD')).resolves.toBe(
        false,
      );
    });

    it('FREE/BASIC/PRO/ENTERPRISE không bị ảnh hưởng bởi expiredAt (chỉ TRIAL mới áp dụng logic hết hạn)', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'PRO',
        status: 'ACTIVE',
        expiredAt: new Date('2020-01-01T00:00:00.000Z'),
        entitlementOverrides: null,
      });
      await expect(
        service.hasFeature('org-1', 'RBAC_MANAGEMENT'),
      ).resolves.toBe(true);
    });
  });
});
