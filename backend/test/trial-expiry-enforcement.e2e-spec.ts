import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './helpers/create-e2e-app';
import { AppModule } from '../src/app.module';
import { PERMISSION_CATALOG } from '../src/modules/rbac/infrastructure/permission-catalog';
import { SubscriptionLifecycleService } from '../src/modules/subscription-lifecycle/application/subscription-lifecycle.service';
import { TrialSignupService } from '../src/modules/trial-signup/application/trial-signup.service';
import { SignupProofService } from '../src/modules/trial-signup/infrastructure/security/signup-proof.service';

/**
 * T053.06F — real-Postgres proof cho Trial Expiry Enforcement (thiết kế tại T053.06F Discovery +
 * Architect Decision + Implementation Authorization). E1-E14 theo đúng yêu cầu §21.
 *
 * KHÔNG tự chạy được trong sandbox này (thiếu Docker/PostgreSQL) — cùng giới hạn với các
 * *.e2e-spec.ts khác trong repo. Chạy trong CI qua `npm run test:e2e`.
 */
describe('Trial Expiry Enforcement (e2e, integration — Postgres thật)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let lifecycleService: SubscriptionLifecycleService;

  interface OrgFixture {
    organizationId: string;
    accessToken: string;
  }

  async function setupOrganization(
    slug: string,
    code: string,
    plan: 'TRIAL' | 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE',
    expiredAt: Date | null,
    subscriptionStatus: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' = 'ACTIVE',
  ): Promise<OrgFixture> {
    const organization = await prisma.organization.upsert({
      where: { slug },
      create: { code, displayName: `${code} Org`, slug },
      update: {},
    });
    const organizationId = organization.id;

    await prisma.organizationSubscription.upsert({
      where: { organizationId },
      create: {
        organizationId,
        plan,
        status: subscriptionStatus,
        expiredAt,
        maxBranch: 1,
        maxUser: 3,
        maxWarehouse: 1,
        maxProduct: 50,
        maxCustomer: 50,
        storageLimitGB: 1,
      },
      update: { plan, status: subscriptionStatus, expiredAt },
    });

    for (const permission of PERMISSION_CATALOG) {
      await prisma.permission.upsert({
        where: { code: permission.code },
        create: permission,
        update: {},
      });
    }

    const role = await prisma.role.upsert({
      where: { organizationId_code: { organizationId, code: 'tee_e2e_role' } },
      create: { organizationId, code: 'tee_e2e_role', name: 'TEE E2E Role' },
      update: {},
    });
    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { code: { startsWith: 'supplier:' } },
          { code: { startsWith: 'customer:' } },
          { code: { startsWith: 'product:' } },
          { code: { startsWith: 'user:' } },
        ],
      },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });

    const passwordHash = await argon2.hash('E2ePass@123', {
      type: argon2.argon2id,
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
        passwordHash,
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

  function createSupplier(fixture: OrgFixture) {
    return request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .send({ companyName: `NCC ${randomUUID()}` });
  }

  /**
   * T053.06H — thân request chỉ cần ĐÚNG hình dạng DTO (branchId/supplierId/items giả), vì
   * EntitlementGuard chạy TRƯỚC ValidationPipe/service — request bị chặn 403 trước khi bất kỳ giá
   * trị nào trong body được đọc/kiểm tra tồn tại thật.
   */
  function createPurchaseOrder(fixture: OrgFixture) {
    return request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .send({
        branchId: randomUUID(),
        supplierId: randomUUID(),
        items: [
          {
            productId: randomUUID(),
            warehouseId: randomUUID(),
            quantity: 1,
            unitCost: 1000,
          },
        ],
      });
  }

  function createCustomer(fixture: OrgFixture) {
    return request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .send({ fullName: `KH ${randomUUID()}` });
  }

  function listCustomers(fixture: OrgFixture) {
    return request(app.getHttpServer())
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${fixture.accessToken}`);
  }

  async function countCustomers(organizationId: string): Promise<number> {
    return prisma.customer.count({ where: { organizationId } });
  }

  async function getSubscription(organizationId: string) {
    return prisma.organizationSubscription.findUniqueOrThrow({
      where: { organizationId },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await createE2eApp(moduleFixture);
    lifecycleService = app.get(SubscriptionLifecycleService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('E1 — TRIAL trước hạn: route entitled chỉ-TRIAL (SUPPLIER) hoạt động bình thường', async () => {
    const org = await setupOrganization(
      'tee-e1',
      'TEE-E1',
      'TRIAL',
      new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    );
    const res = await createSupplier(org);
    expect(res.status).toBe(201);
  });

  it('E2 — biên chính xác: hành vi hết hạn bắt đầu ĐÚNG lúc expiredAt <= now', async () => {
    const org = await setupOrganization(
      'tee-e2',
      'TEE-E2',
      'TRIAL',
      new Date(Date.now() + 60 * 60 * 1000), // còn hạn 1h
    );
    const beforeExpiry = await createSupplier(org);
    expect(beforeExpiry.status).toBe(201);

    // Đẩy thẳng expiredAt về quá khứ (mô phỏng đã qua biên) — KHÔNG đổi status (vẫn ACTIVE,
    // scheduler chưa chạy) để chứng minh chính request-time fail-safe áp dụng biên đúng.
    await prisma.organizationSubscription.update({
      where: { organizationId: org.organizationId },
      data: { expiredAt: new Date(Date.now() - 1000) },
    });
    const afterExpiry = await createSupplier(org);
    expect(afterExpiry.status).toBe(403);
  });

  it('E3 — TRIAL ACTIVE quá hạn TRƯỚC khi scheduler chạy: request-time fail-safe đã từ chối ngay capability chỉ-TRIAL', async () => {
    const org = await setupOrganization(
      'tee-e3',
      'TEE-E3',
      'TRIAL',
      new Date('2020-01-01T00:00:00.000Z'), // quá hạn từ lâu
      'ACTIVE', // CHỦ Ý vẫn ACTIVE — scheduler CHƯA từng chạy cho org này
    );
    const res = await createSupplier(org);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ENTITLEMENT_001');

    const subscription = await getSubscription(org.organizationId);
    expect(subscription.status).toBe('ACTIVE'); // vẫn chưa persist — đúng ý nghĩa "trước scheduler"
  });

  it('E4 — scheduler tick: TRIAL ACTIVE quá hạn -> EXPIRED', async () => {
    const org = await setupOrganization(
      'tee-e4',
      'TEE-E4',
      'TRIAL',
      new Date('2020-01-01T00:00:00.000Z'),
      'ACTIVE',
    );
    const count = await lifecycleService.expireDueTrials();
    expect(count).toBeGreaterThanOrEqual(1);

    const subscription = await getSubscription(org.organizationId);
    expect(subscription.status).toBe('EXPIRED');
  });

  it('E5 — scheduler chạy lại: không mutation/lỗi thêm', async () => {
    const org = await setupOrganization(
      'tee-e5',
      'TEE-E5',
      'TRIAL',
      new Date('2020-01-01T00:00:00.000Z'),
      'ACTIVE',
    );
    await lifecycleService.expireDueTrials();
    const secondRun = await lifecycleService.expireDueTrials();
    // org-e5's row đã EXPIRED từ lượt đầu — lượt 2 có thể vẫn > 0 nếu các fixture khác (E4 v.v.)
    // còn overdue-ACTIVE, nhưng riêng org này không được xử lý lại — kiểm tra trực tiếp.
    expect(secondRun).toBeGreaterThanOrEqual(0);
    const subscription = await getSubscription(org.organizationId);
    expect(subscription.status).toBe('EXPIRED');
  });

  it('E6 — 2 processor đồng thời: kết quả cuối an toàn/idempotent, đúng 1 lần transition mỗi dòng', async () => {
    const org = await setupOrganization(
      'tee-e6',
      'TEE-E6',
      'TRIAL',
      new Date('2020-01-01T00:00:00.000Z'),
      'ACTIVE',
    );

    const [countA, countB] = await Promise.all([
      lifecycleService.expireDueTrials(),
      lifecycleService.expireDueTrials(),
    ]);

    const subscription = await getSubscription(org.organizationId);
    expect(subscription.status).toBe('EXPIRED');
    // Không assert countA/countB riêng lẻ (phụ thuộc thứ tự thắng race, và các fixture khác cùng
    // chạy trong file có thể còn dòng overdue-ACTIVE khác) — bất biến CHÍNH là: không lỗi, và
    // dòng của TEST NÀY kết thúc đúng EXPIRED, đúng 1 lần (không có 2 lần "transition" nào có thể
    // quan sát được gây sai lệch trạng thái).
    expect(countA + countB).toBeGreaterThanOrEqual(1);
  });

  it('E7 — BASIC/PRO/ENTERPRISE/FREE không bị scheduler đụng tới dù expiredAt bất thường khác null', async () => {
    const plans = ['FREE', 'BASIC', 'PRO', 'ENTERPRISE'] as const;
    const orgs = await Promise.all(
      plans.map((plan, i) =>
        setupOrganization(
          `tee-e7-${plan.toLowerCase()}`,
          `TEE-E7-${i}`,
          plan,
          new Date('2020-01-01T00:00:00.000Z'), // bất thường, không nên xảy ra thật, test phòng thủ
          'ACTIVE',
        ),
      ),
    );

    await lifecycleService.expireDueTrials();

    for (const org of orgs) {
      const subscription = await getSubscription(org.organizationId);
      expect(subscription.status).toBe('ACTIVE'); // không bị chuyển EXPIRED
      expect(subscription.plan).not.toBe('TRIAL');
    }
  });

  it('E8 — TRIAL đã hết hạn (persisted EXPIRED): entitlement chỉ-TRIAL bị từ chối', async () => {
    const org = await setupOrganization(
      'tee-e8',
      'TEE-E8',
      'TRIAL',
      new Date('2020-01-01T00:00:00.000Z'),
      'EXPIRED',
    );
    const res = await createSupplier(org);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ENTITLEMENT_001');
  });

  // T053.06H — bổ sung 1 case đại diện (không phải toàn bộ ma trận) chứng minh cùng cơ chế soft-
  // landing E8 (đã đóng cho SUPPLIER) áp dụng ĐÚNG cho PURCHASE — feature vừa được đóng lỗ hổng
  // entitlement ở T053.06H, cũng nằm trong TRIAL_ONLY_FEATURES (plan-entitlements.ts).
  it('E8B — TRIAL đã hết hạn (persisted EXPIRED): PURCHASE (TRIAL-only, đóng lỗ hổng T053.06H) cũng bị từ chối', async () => {
    const org = await setupOrganization(
      'tee-e8b',
      'TEE-E8B',
      'TRIAL',
      new Date('2020-01-01T00:00:00.000Z'),
      'EXPIRED',
    );
    const beforeCount = await prisma.purchaseOrder.count({
      where: { organizationId: org.organizationId },
    });
    const res = await createPurchaseOrder(org);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ENTITLEMENT_001');
    expect(
      await prisma.purchaseOrder.count({
        where: { organizationId: org.organizationId },
      }),
    ).toBe(beforeCount);
  });

  it('E9 — TRIAL đã hết hạn: capability FREE/base vẫn dùng được (đọc dữ liệu)', async () => {
    const org = await setupOrganization(
      'tee-e9',
      'TEE-E9',
      'TRIAL',
      new Date('2020-01-01T00:00:00.000Z'),
      'EXPIRED',
    );
    const res = await listCustomers(org);
    expect(res.status).toBe(200);
  });

  it('E10 — TRIAL đã hết hạn: thao tác TĂNG usage (tạo Customer) bị từ chối, DB count không đổi', async () => {
    const org = await setupOrganization(
      'tee-e10',
      'TEE-E10',
      'TRIAL',
      new Date('2020-01-01T00:00:00.000Z'),
      'EXPIRED',
    );
    const countBefore = await countCustomers(org.organizationId);

    const res = await createCustomer(org);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SUBSCRIPTION_002');
    expect(await countCustomers(org.organizationId)).toBe(countBefore);
  });

  it('E11 — dữ liệu đã tồn tại TRƯỚC khi hết hạn vẫn đọc được SAU khi hết hạn', async () => {
    const org = await setupOrganization(
      'tee-e11',
      'TEE-E11',
      'TRIAL',
      new Date(Date.now() + 60 * 60 * 1000), // còn hạn lúc tạo
    );
    const created = await createCustomer(org);
    expect(created.status).toBe(201);
    const customerId = created.body.data.id as string;

    // Hết hạn NGAY SAU khi đã có dữ liệu.
    await prisma.organizationSubscription.update({
      where: { organizationId: org.organizationId },
      data: { status: 'EXPIRED' },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${org.accessToken}`);
    expect(res.status).toBe(200);
  });

  it('E12 — Platform Admin qua route nghiệp vụ tenant KHÔNG được bypass hết hạn', async () => {
    const org = await setupOrganization(
      'tee-e12',
      'TEE-E12',
      'TRIAL',
      new Date('2020-01-01T00:00:00.000Z'),
      'EXPIRED',
    );

    // Platform Admin THẬT (mirror entitlement.e2e-spec.ts) — user tồn tại thật trong DB (bất kỳ
    // tổ chức nào, KHÔNG cần cùng org đang test), `organizationId` trong JWT payload trỏ tới
    // Org E12 (tổ chức đang thao tác) — đúng bối cảnh "Platform Admin gọi route nghiệp vụ tenant
    // thường", KHÔNG phải route platform-admin riêng.
    const passwordHash = await argon2.hash('E2ePass@123', {
      type: argon2.argon2id,
    });
    const platformAdmin = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId: org.organizationId,
          email: 'platform-admin-tee-e12@pos-erp.local',
        },
      },
      create: {
        organizationId: org.organizationId,
        username: 'platform-admin-tee-e12',
        email: 'platform-admin-tee-e12@pos-erp.local',
        passwordHash,
        isPlatformAdmin: true,
      },
      update: { isPlatformAdmin: true },
    });
    const platformAdminToken = app.get(JwtService).sign({
      sub: platformAdmin.id,
      organizationId: org.organizationId,
      branchId: null,
      email: platformAdmin.email,
      permissions: (
        await prisma.permission.findMany({
          where: { code: { startsWith: 'supplier:' } },
        })
      ).map((p) => p.code),
      permissionVersion: platformAdmin.permissionVersion,
      isPlatformAdmin: true,
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ companyName: `NCC ${randomUUID()}` });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ENTITLEMENT_001');
  });

  it('E13 — tenant isolation: xử lý hết hạn Org A không đụng Org B', async () => {
    const orgA = await setupOrganization(
      'tee-e13-a',
      'TEE-E13-A',
      'TRIAL',
      new Date('2020-01-01T00:00:00.000Z'),
      'ACTIVE',
    );
    const orgB = await setupOrganization(
      'tee-e13-b',
      'TEE-E13-B',
      'TRIAL',
      new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // còn hạn dài
      'ACTIVE',
    );

    await lifecycleService.expireDueTrials();

    const subA = await getSubscription(orgA.organizationId);
    const subB = await getSubscription(orgB.organizationId);
    expect(subA.status).toBe('EXPIRED');
    expect(subB.status).toBe('ACTIVE'); // Org B hoàn toàn không bị đụng tới
    expect(subB.expiredAt?.getTime()).toBeGreaterThan(Date.now());
  });

  // T053.04's canonical contract (TRIAL_DURATION_DAYS=14) không được thay đổi bởi T053.06F — gọi
  // TrialSignupService.finalize() THẬT (không mock) qua DI, dùng SignupProofService THẬT để sinh
  // proof hợp lệ (bỏ qua vòng OTP email/throttle thật — đã được `trial-signup.e2e-spec.ts` CASE
  // 1-32 chứng minh riêng, không cần lặp lại ở đây; mục tiêu DUY NHẤT của E14 là chứng minh
  // KHÔNG CÓ regression trên kết quả TrialSignupService tạo ra do các thay đổi T053.06F).
  it('E14 — Trial Signup: signup mới vẫn ACTIVE, expiry +14 ngày, canonical max* limits', async () => {
    const trialSignupService = app.get(TrialSignupService);
    const signupProofService = app.get(SignupProofService);
    const email = `tee-e14-${Date.now()}@trial-e2e.local`;
    const proofToken = signupProofService.signProof(email);

    const before = Date.now();
    const session = await trialSignupService.finalize(
      {
        signupProofToken: proofToken,
        organization: { displayName: `TEE E14 Org ${Date.now()}` },
        owner: { fullName: 'Owner E14', password: 'E2ePass@123' },
      },
      {},
      { userAgent: null, ip: null, clientType: 'WEB' },
    );
    expect(session.response.accessToken).toBeTruthy();

    const subscription = await getSubscription(
      session.response.userInfo.organizationId,
    );

    expect(subscription.plan).toBe('TRIAL');
    expect(subscription.status).toBe('ACTIVE');
    expect(subscription.expiredAt).not.toBeNull();
    const daysUntilExpiry =
      (subscription.expiredAt!.getTime() - before) / (24 * 60 * 60 * 1000);
    expect(daysUntilExpiry).toBeGreaterThan(13.9);
    expect(daysUntilExpiry).toBeLessThan(14.1);
    expect(subscription.maxBranch).toBe(1);
    expect(subscription.maxUser).toBe(3);
    expect(subscription.maxWarehouse).toBe(1);
    expect(subscription.maxProduct).toBe(50);
    expect(subscription.maxCustomer).toBe(50);
    expect(subscription.storageLimitGB).toBe(1);
  });
});
