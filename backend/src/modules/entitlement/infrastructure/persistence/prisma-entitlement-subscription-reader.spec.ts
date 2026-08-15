import { PrismaService } from '../../../../prisma/prisma.service';
import { PrismaEntitlementSubscriptionReader } from './prisma-entitlement-subscription-reader';

describe('PrismaEntitlementSubscriptionReader (T053.03 §7/§23 — narrow read port)', () => {
  let reader: PrismaEntitlementSubscriptionReader;
  let prisma: {
    organizationSubscription: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      organizationSubscription: { findUnique: jest.fn() },
    };
    reader = new PrismaEntitlementSubscriptionReader(
      prisma as unknown as PrismaService,
    );
  });

  it('trả null khi không có subscription row', async () => {
    prisma.organizationSubscription.findUnique.mockResolvedValue(null);
    await expect(reader.findByOrganizationId('org-1')).resolves.toBeNull();
  });

  it('trả plan + entitlementOverrides khi có row, chỉ select 2 field (query hẹp)', async () => {
    prisma.organizationSubscription.findUnique.mockResolvedValue({
      plan: 'PRO',
      entitlementOverrides: { SUPPLIER: false },
    });
    const result = await reader.findByOrganizationId('org-1');
    expect(result).toEqual({
      plan: 'PRO',
      entitlementOverrides: { SUPPLIER: false },
    });
    expect(prisma.organizationSubscription.findUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      select: { plan: true, entitlementOverrides: true },
    });
  });
});
