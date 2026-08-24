import { USAGE_RESOURCE_TYPES } from '../../usage-limit/domain/usage-resource-type';
import { SUBSCRIPTION_PLAN_LIMITS } from '../../organization/domain/policies/subscription-plan-defaults';
import {
  changeSubscriptionPlan,
  SubscriptionPlanChangeDowngradeBlockedError,
  SubscriptionPlanChangeInvalidTargetError,
  SubscriptionPlanChangeInvalidTargetPlanError,
  SubscriptionPlanChangeOrganizationNotFoundError,
  SubscriptionPlanChangeSubscriptionMissingError,
} from './subscription-plan-changer';

describe('changeSubscriptionPlan (T053.06I)', () => {
  const organization = { id: 'org-1', slug: 'acme' };

  function baseSubscription(overrides: Record<string, unknown> = {}) {
    return {
      id: 'sub-1',
      organizationId: 'org-1',
      plan: 'FREE',
      status: 'ACTIVE',
      expiredAt: null,
      maxBranch: null,
      maxUser: null,
      maxWarehouse: null,
      maxProduct: null,
      maxCustomer: null,
      storageLimitGB: null,
      entitlementOverrides: null,
      ...overrides,
    };
  }

  function makeTx(
    overrides: {
      subscription?: ReturnType<typeof baseSubscription> | null;
      userCount?: number;
      branchCount?: number;
      warehouseCount?: number;
      productCount?: number;
      customerCount?: number;
    } = {},
  ) {
    return {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      organizationSubscription: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            overrides.subscription === undefined
              ? baseSubscription()
              : overrides.subscription,
          ),
        update: jest
          .fn()
          .mockImplementation(
            ({ data }: { data: Record<string, unknown> }) => ({
              id: 'sub-1',
              organizationId: 'org-1',
              ...data,
            }),
          ),
      },
      user: { count: jest.fn().mockResolvedValue(overrides.userCount ?? 0) },
      branch: {
        count: jest.fn().mockResolvedValue(overrides.branchCount ?? 0),
      },
      warehouse: {
        count: jest.fn().mockResolvedValue(overrides.warehouseCount ?? 0),
      },
      product: {
        count: jest.fn().mockResolvedValue(overrides.productCount ?? 0),
      },
      customer: {
        count: jest.fn().mockResolvedValue(overrides.customerCount ?? 0),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };
  }

  function makePrisma(tx: ReturnType<typeof makeTx>) {
    return {
      organization: {
        findUnique: jest.fn().mockResolvedValue(organization),
      },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
    };
  }

  // U1
  it('U1: FREE -> BASIC thành công', async () => {
    const tx = makeTx({ subscription: baseSubscription({ plan: 'FREE' }) });
    const prisma = makePrisma(tx);

    const result = await changeSubscriptionPlan(prisma as never, {
      organizationId: 'org-1',
      targetPlan: 'BASIC',
      commit: true,
    });

    expect(result.outcome).toBe('CHANGED');
    expect(tx.organizationSubscription.update).toHaveBeenCalled();
  });

  // U2
  it('U2: TRIAL ACTIVE -> BASIC thành công', async () => {
    const tx = makeTx({
      subscription: baseSubscription({
        plan: 'TRIAL',
        status: 'ACTIVE',
        expiredAt: new Date(Date.now() + 86_400_000),
        maxUser: 3,
        maxBranch: 1,
        maxWarehouse: 1,
        maxProduct: 50,
        maxCustomer: 50,
        storageLimitGB: 1,
      }),
    });
    const prisma = makePrisma(tx);

    const result = await changeSubscriptionPlan(prisma as never, {
      organizationId: 'org-1',
      targetPlan: 'BASIC',
      commit: true,
    });

    expect(result.outcome).toBe('CHANGED');
    if (result.outcome === 'CHANGED') {
      expect(result.previousPlan).toBe('TRIAL');
      expect(result.targetPlan).toBe('BASIC');
    }
  });

  // U3
  it('U3: TRIAL EXPIRED -> PRO thành công, status->ACTIVE, expiredAt->null', async () => {
    const tx = makeTx({
      subscription: baseSubscription({
        plan: 'TRIAL',
        status: 'EXPIRED',
        expiredAt: new Date('2020-01-01'),
        maxUser: 3,
      }),
    });
    const prisma = makePrisma(tx);

    const result = await changeSubscriptionPlan(prisma as never, {
      organizationId: 'org-1',
      targetPlan: 'PRO',
      commit: true,
    });

    expect(result.outcome).toBe('CHANGED');
    expect(tx.organizationSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE', expiredAt: null }),
      }),
    );
  });

  // U4
  it('U4: BASIC -> PRO thành công (upgrade không bị chặn bởi usage cũ)', async () => {
    const tx = makeTx({
      subscription: baseSubscription({
        plan: 'BASIC',
        ...SUBSCRIPTION_PLAN_LIMITS.BASIC,
      }),
      userCount: 5,
    });
    const prisma = makePrisma(tx);

    const result = await changeSubscriptionPlan(prisma as never, {
      organizationId: 'org-1',
      targetPlan: 'PRO',
      commit: true,
    });

    expect(result.outcome).toBe('CHANGED');
  });

  // U5
  it('U5: PRO -> BASIC thành công khi usage nằm trong hạn mức mục tiêu', async () => {
    const tx = makeTx({
      subscription: baseSubscription({
        plan: 'PRO',
        ...SUBSCRIPTION_PLAN_LIMITS.PRO,
      }),
      userCount: 2,
      branchCount: 1,
      warehouseCount: 1,
    });
    const prisma = makePrisma(tx);

    const result = await changeSubscriptionPlan(prisma as never, {
      organizationId: 'org-1',
      targetPlan: 'BASIC',
      commit: true,
    });

    expect(result.outcome).toBe('CHANGED');
  });

  // U6
  it('U6: PRO -> BASIC bị chặn khi usage vượt hạn mức mục tiêu', async () => {
    const tx = makeTx({
      subscription: baseSubscription({
        plan: 'PRO',
        ...SUBSCRIPTION_PLAN_LIMITS.PRO,
      }),
      userCount: 6, // BASIC.maxUser = 5
    });
    const prisma = makePrisma(tx);

    await expect(
      changeSubscriptionPlan(prisma as never, {
        organizationId: 'org-1',
        targetPlan: 'BASIC',
        commit: true,
      }),
    ).rejects.toThrow(SubscriptionPlanChangeDowngradeBlockedError);
    expect(tx.organizationSubscription.update).not.toHaveBeenCalled();
  });

  // U7
  it('U7: hạn mức canonical của target plan được ghi đúng, không copy số liệu riêng', async () => {
    const tx = makeTx({ subscription: baseSubscription({ plan: 'FREE' }) });
    const prisma = makePrisma(tx);

    await changeSubscriptionPlan(prisma as never, {
      organizationId: 'org-1',
      targetPlan: 'ENTERPRISE',
      commit: true,
    });

    expect(tx.organizationSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining(SUBSCRIPTION_PLAN_LIMITS.ENTERPRISE),
      }),
    );
  });

  // U8
  it('U8: target trả về paid plan luôn clear expiredAt (kể cả subscription trước đó có expiredAt lệch)', async () => {
    const tx = makeTx({
      subscription: baseSubscription({
        plan: 'BASIC',
        status: 'ACTIVE',
        expiredAt: new Date('2099-01-01'), // trạng thái lệch, không coherent
      }),
    });
    const prisma = makePrisma(tx);

    const result = await changeSubscriptionPlan(prisma as never, {
      organizationId: 'org-1',
      targetPlan: 'PRO',
      commit: true,
    });

    expect(result.outcome).toBe('CHANGED');
    expect(tx.organizationSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expiredAt: null }),
      }),
    );
  });

  // U9
  it('U9: target plan trả về status ACTIVE dù nguồn đang EXPIRED/CANCELLED', async () => {
    const tx = makeTx({
      subscription: baseSubscription({
        plan: 'TRIAL',
        status: 'CANCELLED',
        expiredAt: new Date('2020-01-01'),
      }),
    });
    const prisma = makePrisma(tx);

    await changeSubscriptionPlan(prisma as never, {
      organizationId: 'org-1',
      targetPlan: 'FREE',
      commit: true,
    });

    expect(tx.organizationSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });

  // U10
  it('U10: thiếu OrganizationSubscription -> fail closed', async () => {
    const tx = makeTx({ subscription: null });
    const prisma = makePrisma(tx);

    await expect(
      changeSubscriptionPlan(prisma as never, {
        organizationId: 'org-1',
        targetPlan: 'BASIC',
        commit: true,
      }),
    ).rejects.toThrow(SubscriptionPlanChangeSubscriptionMissingError);
  });

  // U11
  it('U11: Organization không tồn tại -> fail trước khi mở transaction', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    prisma.organization.findUnique.mockResolvedValue(null);

    await expect(
      changeSubscriptionPlan(prisma as never, {
        organizationId: 'org-missing',
        targetPlan: 'BASIC',
        commit: true,
      }),
    ).rejects.toThrow(SubscriptionPlanChangeOrganizationNotFoundError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // U12
  it('U12: plan mục tiêu không hợp lệ -> fail trước khi tra cứu Organization', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);

    await expect(
      changeSubscriptionPlan(prisma as never, {
        organizationId: 'org-1',
        targetPlan: 'GOLD',
        commit: true,
      }),
    ).rejects.toThrow(SubscriptionPlanChangeInvalidTargetPlanError);
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  // U13
  it('U13: target TRIAL bị từ chối (không có chính sách dùng-thử-lại được duyệt)', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);

    await expect(
      changeSubscriptionPlan(prisma as never, {
        organizationId: 'org-1',
        targetPlan: 'TRIAL',
        commit: true,
      }),
    ).rejects.toThrow(SubscriptionPlanChangeInvalidTargetPlanError);
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  // U14
  it('U14: dry-run (commit=false) trên 1 transition hợp lệ -> không ghi gì', async () => {
    const tx = makeTx({ subscription: baseSubscription({ plan: 'FREE' }) });
    const prisma = makePrisma(tx);

    const result = await changeSubscriptionPlan(prisma as never, {
      organizationId: 'org-1',
      targetPlan: 'BASIC',
      commit: false,
    });

    expect(result.outcome).toBe('PREVIEW');
    if (result.outcome === 'PREVIEW') {
      expect(result.allowed).toBe(true);
    }
    expect(tx.organizationSubscription.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  // U15
  it('U15: preview (commit=false) trên transition sẽ-bị-chặn -> báo cáo allowed=false, không ghi/không throw', async () => {
    const tx = makeTx({
      subscription: baseSubscription({
        plan: 'PRO',
        ...SUBSCRIPTION_PLAN_LIMITS.PRO,
      }),
      userCount: 6,
    });
    const prisma = makePrisma(tx);

    const result = await changeSubscriptionPlan(prisma as never, {
      organizationId: 'org-1',
      targetPlan: 'BASIC',
      commit: false,
    });

    expect(result.outcome).toBe('PREVIEW');
    if (result.outcome === 'PREVIEW') {
      expect(result.allowed).toBe(false);
      expect(result.blockedResource).toBe('USER');
    }
    expect(tx.organizationSubscription.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  // U16
  it('U16: mutation thành công ghi đúng 1 AuditLog trong CÙNG transaction, sau update', async () => {
    const tx = makeTx({ subscription: baseSubscription({ plan: 'FREE' }) });
    const prisma = makePrisma(tx);

    await changeSubscriptionPlan(prisma as never, {
      organizationId: 'org-1',
      targetPlan: 'BASIC',
      commit: true,
    });

    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'organization.subscription.plan_changed',
          entityType: 'OrganizationSubscription',
          userId: null,
        }),
      }),
    );
    const updateOrder =
      tx.organizationSubscription.update.mock.invocationCallOrder[0];
    const auditOrder = tx.auditLog.create.mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(auditOrder);
  });

  // U17
  it('U17: thất bại (downgrade bị chặn) không ghi OrganizationSubscription nào', async () => {
    const tx = makeTx({
      subscription: baseSubscription({
        plan: 'PRO',
        ...SUBSCRIPTION_PLAN_LIMITS.PRO,
      }),
      userCount: 100,
    });
    const prisma = makePrisma(tx);

    await expect(
      changeSubscriptionPlan(prisma as never, {
        organizationId: 'org-1',
        targetPlan: 'BASIC',
        commit: true,
      }),
    ).rejects.toThrow(SubscriptionPlanChangeDowngradeBlockedError);
    expect(tx.organizationSubscription.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  // U18
  it('U18: gọi lại khi ĐÃ ở đúng trạng thái mục tiêu -> NO_OP, không ghi gì', async () => {
    const tx = makeTx({
      subscription: baseSubscription({
        plan: 'BASIC',
        status: 'ACTIVE',
        expiredAt: null,
        ...SUBSCRIPTION_PLAN_LIMITS.BASIC,
      }),
    });
    const prisma = makePrisma(tx);

    const result = await changeSubscriptionPlan(prisma as never, {
      organizationId: 'org-1',
      targetPlan: 'BASIC',
      commit: true,
    });

    expect(result.outcome).toBe('NO_OP');
    expect(tx.organizationSubscription.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  // U19
  it('U19: entitlementOverrides KHÔNG bị đụng tới trong payload update', async () => {
    const tx = makeTx({ subscription: baseSubscription({ plan: 'FREE' }) });
    const prisma = makePrisma(tx);

    await changeSubscriptionPlan(prisma as never, {
      organizationId: 'org-1',
      targetPlan: 'BASIC',
      commit: true,
    });

    const call = tx.organizationSubscription.update.mock.calls[0][0];
    expect(call.data).not.toHaveProperty('entitlementOverrides');
  });

  // U20
  it('U20: khoá được lấy TRƯỚC khi đọc subscription (cơ chế đảm bảo coherence khi đồng thời)', async () => {
    const tx = makeTx({ subscription: baseSubscription({ plan: 'FREE' }) });
    const prisma = makePrisma(tx);

    await changeSubscriptionPlan(prisma as never, {
      organizationId: 'org-1',
      targetPlan: 'BASIC',
      commit: true,
    });

    const lastLockCallOrder =
      tx.$executeRaw.mock.invocationCallOrder[
        tx.$executeRaw.mock.invocationCallOrder.length - 1
      ];
    const readOrder =
      tx.organizationSubscription.findUnique.mock.invocationCallOrder[0];
    expect(lastLockCallOrder).toBeLessThan(readOrder);
  });

  // U21
  it('U21: 5 khoá usage-limit được lấy theo ĐÚNG thứ tự canonical cố định', async () => {
    const tx = makeTx({ subscription: baseSubscription({ plan: 'FREE' }) });
    const prisma = makePrisma(tx);

    await changeSubscriptionPlan(prisma as never, {
      organizationId: 'org-1',
      targetPlan: 'BASIC',
      commit: true,
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(USAGE_RESOURCE_TYPES.length);
    const resourceArgOrder = tx.$executeRaw.mock.calls.map(
      (call: unknown[]) => call[2],
    );
    expect(resourceArgOrder).toEqual([...USAGE_RESOURCE_TYPES]);
  });

  // U22
  it('U22: đếm usage dùng ĐÚNG ngữ nghĩa canonical đã khoá ở T053.05B cho từng resource', async () => {
    const tx = makeTx({ subscription: baseSubscription({ plan: 'FREE' }) });
    const prisma = makePrisma(tx);

    await changeSubscriptionPlan(prisma as never, {
      organizationId: 'org-1',
      targetPlan: 'BASIC',
      commit: true,
    });

    expect(tx.user.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', deletedAt: null },
    });
    expect(tx.branch.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', status: 'ACTIVE' },
    });
    expect(tx.warehouse.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', deletedAt: null },
    });
    expect(tx.product.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', deletedAt: null },
    });
    expect(tx.customer.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', deletedAt: null },
    });
  });

  it('từ chối khi vừa thiếu vừa thừa organization identifier', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);

    await expect(
      changeSubscriptionPlan(prisma as never, {
        targetPlan: 'BASIC',
        commit: true,
      }),
    ).rejects.toThrow(SubscriptionPlanChangeInvalidTargetError);

    await expect(
      changeSubscriptionPlan(prisma as never, {
        organizationId: 'org-1',
        organizationSlug: 'acme',
        targetPlan: 'BASIC',
        commit: true,
      }),
    ).rejects.toThrow(SubscriptionPlanChangeInvalidTargetError);
  });

  it('tra cứu Organization qua slug khi organizationId không được truyền', async () => {
    const tx = makeTx({ subscription: baseSubscription({ plan: 'FREE' }) });
    const prisma = makePrisma(tx);

    await changeSubscriptionPlan(prisma as never, {
      organizationSlug: 'acme',
      targetPlan: 'BASIC',
      commit: true,
    });

    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { slug: 'acme' },
    });
  });
});
