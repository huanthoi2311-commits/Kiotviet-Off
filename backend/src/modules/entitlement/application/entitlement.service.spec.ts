import type { IEntitlementSubscriptionReader } from '../domain/repositories/entitlement-subscription-reader.interface';
import { EntitlementService } from './entitlement.service';

describe('EntitlementService (T053.03 §6/§27.8)', () => {
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
        entitlementOverrides: null,
      });
      await expect(
        service.hasFeature('org-1', 'RBAC_MANAGEMENT'),
      ).resolves.toBe(true);
    });

    it('trả false cho feature không nằm trong Plan', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'BASIC',
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
        entitlementOverrides: { RBAC_MANAGEMENT: true },
      });
      await expect(
        service.hasFeature('org-1', 'RBAC_MANAGEMENT'),
      ).resolves.toBe(true);
    });

    it('override false tắt feature vốn Plan bật', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'PRO',
        entitlementOverrides: { SUPPLIER: false },
      });
      await expect(service.hasFeature('org-1', 'SUPPLIER')).resolves.toBe(
        false,
      );
    });

    it('luôn tra cứu đúng organizationId truyền vào (không hard-code/không dùng org khác)', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'FREE',
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
        entitlementOverrides: null,
      });
      const result = await service.getEffectiveFeatures('org-1');
      expect(result).toHaveLength(15);
    });

    it('entitlementOverrides hỏng (không phải object) => vẫn resolve an toàn theo default Plan', async () => {
      reader.findByOrganizationId.mockResolvedValue({
        plan: 'BASIC',
        entitlementOverrides: 'corrupted-not-an-object',
      });
      const result = await service.getEffectiveFeatures('org-1');
      expect(result).toContain('SUPPLIER');
      expect(result).not.toContain('USER_MANAGEMENT');
    });
  });
});
