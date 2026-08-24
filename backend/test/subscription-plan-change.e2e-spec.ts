import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './helpers/create-e2e-app';
import { AppModule } from '../src/app.module';
import { PERMISSION_CATALOG } from '../src/modules/rbac/infrastructure/permission-catalog';
import { SUBSCRIPTION_PLAN_LIMITS } from '../src/modules/organization/domain/policies/subscription-plan-defaults';
import {
  changeSubscriptionPlan,
  SubscriptionPlanChangeDowngradeBlockedError,
} from '../src/modules/platform/bootstrap/subscription-plan-changer';

/**
 * T053.06I — real-Postgres proof cho Safe Subscription Plan Change CLI. Gọi TRỰC TIẾP
 * `changeSubscriptionPlan()` (chính cơ chế `prisma/change-subscription-plan.ts` /
 * `npm run subscription:change-plan` dùng trong production — không mock, không tái hiện logic
 * riêng) — cùng pattern `platform-admin-promotion.e2e-spec.ts` (gọi thẳng hàm CLI production qua
 * PrismaClient thật, kèm real HTTP để chứng minh hiệu ứng downstream không cần code đặc biệt nào).
 *
 * KHÔNG tự chạy được trong sandbox này (thiếu Docker/PostgreSQL) — cùng giới hạn với các
 * *.e2e-spec.ts khác trong repo. Chạy trong CI qua `npm run test:e2e`.
 */
describe('Subscription Plan Change CLI (e2e, integration — Postgres thật)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    for (const permission of PERMISSION_CATALOG) {
      await prisma.permission.upsert({
        where: { code: permission.code },
        create: permission,
        update: {},
      });
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await createE2eApp(moduleFixture);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  interface OrgFixture {
    organizationId: string;
    accessToken: string;
  }

  async function setupOrganization(
    slug: string,
    code: string,
    subscriptionOverrides: Record<string, unknown> = {},
  ): Promise<OrgFixture> {
    const organization = await prisma.organization.upsert({
      where: { slug },
      create: { code, displayName: `${code} Org`, slug },
      update: {},
    });
    const organizationId = organization.id;

    await prisma.organizationSubscription.upsert({
      where: { organizationId },
      create: { organizationId, ...subscriptionOverrides },
      update: { ...subscriptionOverrides },
    });

    const role = await prisma.role.upsert({
      where: { organizationId_code: { organizationId, code: 'spc_e2e_role' } },
      create: { organizationId, code: 'spc_e2e_role', name: 'SPC E2E Role' },
      update: {},
    });
    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { code: { startsWith: 'supplier:' } },
          { code: { startsWith: 'user:' } },
        ],
      },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });

    const user = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId,
          email: `${slug}@pos-erp.local`,
        },
      },
      create: {
        organizationId,
        username: slug,
        email: `${slug}@pos-erp.local`,
        passwordHash: 'unused-e2e-hash',
      },
      update: {},
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });

    const accessToken = app.get(JwtService).sign({
      sub: user.id,
      organizationId,
      branchId: null,
      email: user.email,
      permissions: permissions.map((p) => p.code),
      permissionVersion: user.permissionVersion,
    });

    return { organizationId, accessToken };
  }

  async function seedUsers(
    organizationId: string,
    count: number,
  ): Promise<void> {
    for (let i = 0; i < count; i++) {
      await prisma.user.create({
        data: {
          organizationId,
          username: `seed-${organizationId.slice(0, 8)}-${i}-${Date.now()}`,
          email: `seed-${organizationId.slice(0, 8)}-${i}-${Date.now()}@e2e.local`,
          passwordHash: 'unused-e2e-hash',
        },
      });
    }
  }

  it('E1: expired TRIAL -> BASIC — ACTIVE/BASIC, expiredAt null, canonical limits persisted', async () => {
    const org = await setupOrganization('spc-e1', 'SPC-E1', {
      plan: 'TRIAL',
      status: 'EXPIRED',
      expiredAt: new Date('2020-01-01'),
      ...SUBSCRIPTION_PLAN_LIMITS.TRIAL,
    });

    const result = await changeSubscriptionPlan(prisma, {
      organizationId: org.organizationId,
      targetPlan: 'BASIC',
      commit: true,
    });
    expect(result.outcome).toBe('CHANGED');

    const row = await prisma.organizationSubscription.findUniqueOrThrow({
      where: { organizationId: org.organizationId },
    });
    expect(row.plan).toBe('BASIC');
    expect(row.status).toBe('ACTIVE');
    expect(row.expiredAt).toBeNull();
    expect(row.maxUser).toBe(SUBSCRIPTION_PLAN_LIMITS.BASIC.maxUser);
    expect(row.maxBranch).toBe(SUBSCRIPTION_PLAN_LIMITS.BASIC.maxBranch);
    expect(row.maxWarehouse).toBe(SUBSCRIPTION_PLAN_LIMITS.BASIC.maxWarehouse);
    expect(row.maxProduct).toBe(SUBSCRIPTION_PLAN_LIMITS.BASIC.maxProduct);
    expect(row.maxCustomer).toBe(SUBSCRIPTION_PLAN_LIMITS.BASIC.maxCustomer);
  });

  it('E2: sau E1, route gắn @RequireEntitlement(SUPPLIER) (BASIC có) thành công tự nhiên, không cần code đặc biệt', async () => {
    const org = await setupOrganization('spc-e2', 'SPC-E2', {
      plan: 'TRIAL',
      status: 'EXPIRED',
      expiredAt: new Date('2020-01-01'),
      ...SUBSCRIPTION_PLAN_LIMITS.TRIAL,
    });

    // Trước khi đổi plan: TRIAL hết hạn -> soft-landed FREE -> KHÔNG có SUPPLIER -> 403.
    await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({ companyName: 'Before Plan Change' })
      .expect(403);

    await changeSubscriptionPlan(prisma, {
      organizationId: org.organizationId,
      targetPlan: 'BASIC',
      commit: true,
    });

    // Sau khi đổi plan: BASIC có SUPPLIER -> 201, KHÔNG cần sửa EntitlementService/cache nào.
    await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({ companyName: 'After Plan Change' })
      .expect(201);
  });

  it('E3: TRIAL ACTIVE -> PRO', async () => {
    const org = await setupOrganization('spc-e3', 'SPC-E3', {
      plan: 'TRIAL',
      status: 'ACTIVE',
      expiredAt: new Date(Date.now() + 86_400_000),
      ...SUBSCRIPTION_PLAN_LIMITS.TRIAL,
    });

    const result = await changeSubscriptionPlan(prisma, {
      organizationId: org.organizationId,
      targetPlan: 'PRO',
      commit: true,
    });
    expect(result.outcome).toBe('CHANGED');

    const row = await prisma.organizationSubscription.findUniqueOrThrow({
      where: { organizationId: org.organizationId },
    });
    expect(row.plan).toBe('PRO');
    expect(row.status).toBe('ACTIVE');
    expect(row.expiredAt).toBeNull();
    expect(row.maxUser).toBe(SUBSCRIPTION_PLAN_LIMITS.PRO.maxUser);
  });

  it('E4: paid upgrade BASIC -> ENTERPRISE', async () => {
    const org = await setupOrganization('spc-e4', 'SPC-E4', {
      plan: 'BASIC',
      status: 'ACTIVE',
      ...SUBSCRIPTION_PLAN_LIMITS.BASIC,
    });

    const result = await changeSubscriptionPlan(prisma, {
      organizationId: org.organizationId,
      targetPlan: 'ENTERPRISE',
      commit: true,
    });
    expect(result.outcome).toBe('CHANGED');

    const row = await prisma.organizationSubscription.findUniqueOrThrow({
      where: { organizationId: org.organizationId },
    });
    expect(row.plan).toBe('ENTERPRISE');
    expect(row.maxUser).toBeNull();
    expect(row.maxBranch).toBeNull();
    expect(row.maxWarehouse).toBeNull();
    expect(row.maxProduct).toBeNull();
    expect(row.maxCustomer).toBeNull();
  });

  it('E5: downgrade an toàn — usage nằm trong hạn mức mục tiêu -> thành công', async () => {
    const org = await setupOrganization('spc-e5', 'SPC-E5', {
      plan: 'PRO',
      status: 'ACTIVE',
      ...SUBSCRIPTION_PLAN_LIMITS.PRO,
    });
    // 1 user chủ (setupOrganization) + seed thêm 2 -> tổng 3, dưới BASIC.maxUser=5.
    await seedUsers(org.organizationId, 2);

    const result = await changeSubscriptionPlan(prisma, {
      organizationId: org.organizationId,
      targetPlan: 'BASIC',
      commit: true,
    });
    expect(result.outcome).toBe('CHANGED');
  });

  it('E6: downgrade bị chặn — usage vượt hạn mức mục tiêu -> từ chối, subscription KHÔNG đổi', async () => {
    const org = await setupOrganization('spc-e6', 'SPC-E6', {
      plan: 'PRO',
      status: 'ACTIVE',
      ...SUBSCRIPTION_PLAN_LIMITS.PRO,
    });
    // 1 user chủ + seed thêm 5 -> tổng 6, vượt BASIC.maxUser=5.
    await seedUsers(org.organizationId, 5);

    const before = await prisma.organizationSubscription.findUniqueOrThrow({
      where: { organizationId: org.organizationId },
    });

    await expect(
      changeSubscriptionPlan(prisma, {
        organizationId: org.organizationId,
        targetPlan: 'BASIC',
        commit: true,
      }),
    ).rejects.toThrow(SubscriptionPlanChangeDowngradeBlockedError);

    const after = await prisma.organizationSubscription.findUniqueOrThrow({
      where: { organizationId: org.organizationId },
    });
    expect(after).toEqual(before);
  });

  it('E7 (HARD GATE): concurrent quota increase vs downgrade — không bao giờ để usage > hạn mức đã persist', async () => {
    const org = await setupOrganization('spc-e7', 'SPC-E7', {
      plan: 'PRO',
      status: 'ACTIVE',
      ...SUBSCRIPTION_PLAN_LIMITS.PRO,
    });
    // 1 user chủ + seed thêm 3 -> tổng 4, ngay dưới BASIC.maxUser=5 — biên đủ hẹp để đua thật có ý nghĩa.
    await seedUsers(org.organizationId, 3);

    const createFifthUser = request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({
        username: `race-${Date.now()}`,
        email: `race-${Date.now()}@e2e.local`,
        password: 'Password123',
      });
    const downgrade = changeSubscriptionPlan(prisma, {
      organizationId: org.organizationId,
      targetPlan: 'BASIC',
      commit: true,
    });

    const [createRes, downgradeRes] = await Promise.allSettled([
      createFifthUser,
      downgrade,
    ]);

    const finalSubscription =
      await prisma.organizationSubscription.findUniqueOrThrow({
        where: { organizationId: org.organizationId },
      });
    const finalUserCount = await prisma.user.count({
      where: { organizationId: org.organizationId, deletedAt: null },
    });

    // Bất biến CỨNG: dù thứ tự thắng-thua thế nào, usage đã persist KHÔNG BAO GIỜ vượt hạn mức
    // đã persist tại CÙNG thời điểm — đây là bằng chứng khoá advisory đã serialize đúng.
    if (finalSubscription.maxUser !== null) {
      expect(finalUserCount).toBeLessThanOrEqual(finalSubscription.maxUser);
    }

    // Ít nhất 1 trong 2 thao tác phải thành công thật (không phải cả 2 cùng thất bại vì lỗi hạ tầng).
    const createSucceeded =
      createRes.status === 'fulfilled' && createRes.value.status === 201;
    const downgradeSucceeded =
      downgradeRes.status === 'fulfilled' &&
      (downgradeRes.value as { outcome: string }).outcome === 'CHANGED';
    expect(createSucceeded || downgradeSucceeded).toBe(true);
  }, 30_000);

  it('E8: 2 lệnh change-plan đồng thời cho CÙNG org — kết quả cuối coherent, không trộn plan/max*', async () => {
    const org = await setupOrganization('spc-e8', 'SPC-E8', {
      plan: 'FREE',
      status: 'ACTIVE',
      ...SUBSCRIPTION_PLAN_LIMITS.FREE,
    });

    const [resA, resB] = await Promise.allSettled([
      changeSubscriptionPlan(prisma, {
        organizationId: org.organizationId,
        targetPlan: 'PRO',
        commit: true,
      }),
      changeSubscriptionPlan(prisma, {
        organizationId: org.organizationId,
        targetPlan: 'ENTERPRISE',
        commit: true,
      }),
    ]);

    // Cả 2 phải resolve thành công (không có thao tác nào bị lỗi hạ tầng) — chỉ khác nhau về việc
    // ai chạy trước/sau do serialize qua advisory lock, không phải cả 2 cùng thất bại.
    expect(resA.status).toBe('fulfilled');
    expect(resB.status).toBe('fulfilled');

    const finalRow = await prisma.organizationSubscription.findUniqueOrThrow({
      where: { organizationId: org.organizationId },
    });
    expect(['PRO', 'ENTERPRISE']).toContain(finalRow.plan);
    // Coherence: max* PHẢI khớp CHÍNH XÁC canonical limits của plan đã persist — không trộn.
    const expectedLimits =
      SUBSCRIPTION_PLAN_LIMITS[finalRow.plan as 'PRO' | 'ENTERPRISE'];
    expect(finalRow.maxUser).toBe(expectedLimits.maxUser);
    expect(finalRow.maxBranch).toBe(expectedLimits.maxBranch);
    expect(finalRow.maxWarehouse).toBe(expectedLimits.maxWarehouse);
    expect(finalRow.maxProduct).toBe(expectedLimits.maxProduct);
    expect(finalRow.maxCustomer).toBe(expectedLimits.maxCustomer);
    expect(finalRow.storageLimitGB).toBe(expectedLimits.storageLimitGB);
  }, 30_000);

  it('E9: dry-run (commit=false) trên transition hợp lệ -> zero mutation, zero audit', async () => {
    const org = await setupOrganization('spc-e9', 'SPC-E9', {
      plan: 'FREE',
      status: 'ACTIVE',
      ...SUBSCRIPTION_PLAN_LIMITS.FREE,
    });
    const before = await prisma.organizationSubscription.findUniqueOrThrow({
      where: { organizationId: org.organizationId },
    });
    const auditCountBefore = await prisma.auditLog.count({
      where: { organizationId: org.organizationId },
    });

    const result = await changeSubscriptionPlan(prisma, {
      organizationId: org.organizationId,
      targetPlan: 'BASIC',
      commit: false,
    });
    expect(result.outcome).toBe('PREVIEW');

    const after = await prisma.organizationSubscription.findUniqueOrThrow({
      where: { organizationId: org.organizationId },
    });
    expect(after).toEqual(before);
    const auditCountAfter = await prisma.auditLog.count({
      where: { organizationId: org.organizationId },
    });
    expect(auditCountAfter).toBe(auditCountBefore);
  });

  it('E10: preview (commit=false, tương đương thiếu --confirm) trên transition sẽ-bị-chặn -> vẫn zero mutation', async () => {
    const org = await setupOrganization('spc-e10', 'SPC-E10', {
      plan: 'PRO',
      status: 'ACTIVE',
      ...SUBSCRIPTION_PLAN_LIMITS.PRO,
    });
    await seedUsers(org.organizationId, 5); // tổng 6, vượt BASIC.maxUser=5
    const before = await prisma.organizationSubscription.findUniqueOrThrow({
      where: { organizationId: org.organizationId },
    });

    const result = await changeSubscriptionPlan(prisma, {
      organizationId: org.organizationId,
      targetPlan: 'BASIC',
      commit: false,
    });
    expect(result.outcome).toBe('PREVIEW');
    if (result.outcome === 'PREVIEW') {
      expect(result.allowed).toBe(false);
    }

    const after = await prisma.organizationSubscription.findUniqueOrThrow({
      where: { organizationId: org.organizationId },
    });
    expect(after).toEqual(before);
  });

  it('E11: entitlementOverrides được giữ nguyên qua plan change', async () => {
    const org = await setupOrganization('spc-e11', 'SPC-E11', {
      plan: 'FREE',
      status: 'ACTIVE',
      entitlementOverrides: { SUPPLIER: true },
      ...SUBSCRIPTION_PLAN_LIMITS.FREE,
    });

    await changeSubscriptionPlan(prisma, {
      organizationId: org.organizationId,
      targetPlan: 'BASIC',
      commit: true,
    });

    const row = await prisma.organizationSubscription.findUniqueOrThrow({
      where: { organizationId: org.organizationId },
    });
    expect(row.entitlementOverrides).toEqual({ SUPPLIER: true });
  });

  it('E12: AuditLog ghi đúng previous/target state và nguồn CLI', async () => {
    const org = await setupOrganization('spc-e12', 'SPC-E12', {
      plan: 'FREE',
      status: 'ACTIVE',
      ...SUBSCRIPTION_PLAN_LIMITS.FREE,
    });

    const result = await changeSubscriptionPlan(prisma, {
      organizationId: org.organizationId,
      targetPlan: 'BASIC',
      commit: true,
    });
    expect(result.outcome).toBe('CHANGED');
    const auditLogId = (result as { auditLogId: string }).auditLogId;

    const audit = await prisma.auditLog.findUniqueOrThrow({
      where: { id: auditLogId },
    });
    expect(audit.action).toBe('organization.subscription.plan_changed');
    expect(audit.entityType).toBe('OrganizationSubscription');
    expect(audit.userId).toBeNull();
    expect(audit.organizationId).toBe(org.organizationId);
    expect((audit.oldValue as { plan: string }).plan).toBe('FREE');
    expect((audit.newValue as { plan: string; changedVia: string }).plan).toBe(
      'BASIC',
    );
    expect((audit.newValue as { changedVia: string }).changedVia).toBe('cli');
  });

  it('E13: chỉ đổi ĐÚNG organization mục tiêu — organization khác KHÔNG bị đụng tới', async () => {
    const orgA = await setupOrganization('spc-e13-a', 'SPC-E13-A', {
      plan: 'FREE',
      status: 'ACTIVE',
      ...SUBSCRIPTION_PLAN_LIMITS.FREE,
    });
    const orgB = await setupOrganization('spc-e13-b', 'SPC-E13-B', {
      plan: 'FREE',
      status: 'ACTIVE',
      ...SUBSCRIPTION_PLAN_LIMITS.FREE,
    });
    const beforeB = await prisma.organizationSubscription.findUniqueOrThrow({
      where: { organizationId: orgB.organizationId },
    });

    await changeSubscriptionPlan(prisma, {
      organizationId: orgA.organizationId,
      targetPlan: 'ENTERPRISE',
      commit: true,
    });

    const afterA = await prisma.organizationSubscription.findUniqueOrThrow({
      where: { organizationId: orgA.organizationId },
    });
    const afterB = await prisma.organizationSubscription.findUniqueOrThrow({
      where: { organizationId: orgB.organizationId },
    });
    expect(afterA.plan).toBe('ENTERPRISE');
    expect(afterB).toEqual(beforeB);
  });
});
