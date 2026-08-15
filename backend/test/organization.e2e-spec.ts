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

/**
 * Integration Test — Organization Module (SPEC-ORG-001, Sprint-00/T002): tạo Organization +
 * Owner atomically, Organization Context (JWT), Archive 2 bước, danh sách chỉ Platform Admin.
 * Cùng giới hạn với các *.e2e-spec.ts trước: KHÔNG tự chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- organization.e2e-spec.ts
 */
describe('Organization Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let platformAdminToken: string;
  let tenantToken: string;
  let tenantOrganizationId: string;

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

    // Tổ chức "bootstrap" chỉ để chứa User Platform Admin (quyền của họ đến từ
    // isPlatformAdmin, không phải Role trong tổ chức này).
    const bootstrapOrg = await prisma.organization.upsert({
      where: { slug: 'org-e2e-bootstrap' },
      create: {
        code: 'ORG-E2E-BOOT',
        displayName: 'Bootstrap Org E2E',
        slug: 'org-e2e-bootstrap',
      },
      update: {},
    });

    const passwordHash = await argon2.hash('E2ePass@123', {
      type: argon2.argon2id,
    });
    const platformAdmin = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId: bootstrapOrg.id,
          email: 'platform-admin-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId: bootstrapOrg.id,
        username: 'platform-admin-e2e',
        email: 'platform-admin-e2e@pos-erp.local',
        passwordHash,
        isPlatformAdmin: true,
      },
      update: { isPlatformAdmin: true },
    });

    // Tổ chức tenant thường (đã có sẵn), dùng để test Organization Context (JWT).
    const tenantOrg = await prisma.organization.upsert({
      where: { slug: 'org-e2e-tenant' },
      create: {
        code: 'ORG-E2E-TENANT',
        displayName: 'Tenant Org E2E',
        slug: 'org-e2e-tenant',
      },
      update: {},
    });
    tenantOrganizationId = tenantOrg.id;

    // T030.12N/T030.12O — findById() (dùng bởi GET /current) đòi hỏi cả OrganizationSettings
    // và OrganizationSubscription tồn tại, được tạo cùng lúc trong luồng POST /organizations
    // thật (createWithOwner) nhưng KHÔNG được raw upsert() ở trên tự tạo — phải tạo tay ở đây.
    await prisma.organizationSettings.upsert({
      where: { organizationId: tenantOrg.id },
      create: { organizationId: tenantOrg.id },
      update: {},
    });
    await prisma.organizationSubscription.upsert({
      where: { organizationId: tenantOrg.id },
      create: { organizationId: tenantOrg.id },
      update: {},
    });

    const role = await prisma.role.upsert({
      where: {
        organizationId_code: {
          organizationId: tenantOrg.id,
          code: 'org_e2e_role',
        },
      },
      create: {
        organizationId: tenantOrg.id,
        code: 'org_e2e_role',
        name: 'Org E2E Role',
      },
      update: {},
    });
    const orgPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'organization:' } },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: orgPermissions.map((p) => ({
        roleId: role.id,
        permissionId: p.id,
      })),
      skipDuplicates: true,
    });
    const tenantUser = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId: tenantOrg.id,
          email: 'tenant-user-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId: tenantOrg.id,
        username: 'tenant-user-e2e',
        email: 'tenant-user-e2e@pos-erp.local',
        passwordHash,
      },
      update: {},
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: tenantUser.id, roleId: role.id } },
      create: { userId: tenantUser.id, roleId: role.id },
      update: {},
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await createE2eApp(moduleFixture);

    const jwtService = app.get(JwtService);
    platformAdminToken = jwtService.sign({
      sub: platformAdmin.id,
      organizationId: bootstrapOrg.id,
      branchId: null,
      email: platformAdmin.email,
      permissions: [],
      permissionVersion: platformAdmin.permissionVersion,
      isPlatformAdmin: true,
    });
    tenantToken = jwtService.sign({
      sub: tenantUser.id,
      organizationId: tenantOrg.id,
      branchId: null,
      email: tenantUser.email,
      permissions: orgPermissions.map((p) => p.code),
      permissionVersion: tenantUser.permissionVersion,
      isPlatformAdmin: false,
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('luồng đầy đủ: tạo Organization + Owner atomically, GET, PATCH, Archive 2 bước', async () => {
    const slug = `org-e2e-new-${Date.now()}`;
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        organization: { displayName: 'New Co', slug },
        owner: {
          fullName: 'New Owner',
          email: `owner-${Date.now()}@newco.com`,
          password: 'Password123',
        },
      })
      .expect(201);

    expect(createRes.body.data.code).toMatch(/^ORG\d{6}$/);
    expect(createRes.body.data.slug).toBe(slug);
    expect(createRes.body.data.status).toBe('ACTIVE');
    expect(createRes.body.data.ownerUserId).toBeTruthy();
    expect(createRes.body.data.settings.defaultCurrency).toBe('VND');
    expect(createRes.body.data.subscription.plan).toBe('FREE');
    const newOrgId = createRes.body.data.id;

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${newOrgId}`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${newOrgId}`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ displayName: 'New Co Updated' })
      .expect(200);

    // Archive 2 bước: confirmSlug sai -> từ chối
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${newOrgId}/archive`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ confirmSlug: 'wrong-slug' })
      .expect(409);

    const archiveRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${newOrgId}/archive`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ confirmSlug: slug })
      .expect(201);
    expect(archiveRes.body.data.status).toBe('ARCHIVED');
  });

  it('SLUG-CONFLICT: từ chối tạo Organization trùng slug', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        organization: { displayName: 'Dup Co', slug: 'org-e2e-tenant' },
        owner: {
          fullName: 'Dup Owner',
          email: 'dup-owner@dup.com',
          password: 'Password123',
        },
      })
      .expect(409);
  });

  // T053.02 CASE 8 — atomicity: request thất bại (slug trùng) không được để lại User/Owner mồ
  // côi — bằng chứng TRẠNG THÁI DATABASE THẬT, không chỉ đếm response HTTP.
  it('ATOMICITY: request tạo Organization thất bại (slug trùng) không để lại User mồ côi', async () => {
    const conflictOwnerEmail = `atomic-check-owner-${Date.now()}@dup.com`;

    await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        organization: { displayName: 'Dup Co 2', slug: 'org-e2e-tenant' },
        owner: {
          fullName: 'Atomic Check Owner',
          email: conflictOwnerEmail,
          password: 'Password123',
        },
      })
      .expect(409);

    const orphanedUser = await prisma.user.findFirst({
      where: { email: conflictOwnerEmail },
    });
    expect(orphanedUser).toBeNull();
  });

  // T053.02 CASE 2/3 — Platform Admin có thể chọn tường minh Plan TRIAL qua đúng luồng
  // provisioning đã được ủy quyền; subscription persist đúng plan + giới hạn D3 + expiredAt
  // (dùng field `expiredAt` đã có sẵn, không phải cột mới).
  it('TRIAL: tạo Organization với subscription.plan=TRIAL, subscription persist đúng plan/giới hạn/expiredAt', async () => {
    const slug = `org-e2e-trial-${Date.now()}`;
    const before = Date.now();
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        organization: { displayName: 'Trial Co', slug },
        owner: {
          fullName: 'Trial Owner',
          email: `trial-owner-${Date.now()}@trial.com`,
          password: 'Password123',
        },
        subscription: { plan: 'TRIAL' },
      })
      .expect(201);
    const after = Date.now();

    expect(createRes.body.data.subscription.plan).toBe('TRIAL');
    expect(createRes.body.data.subscription.maxUser).toBe(3);
    expect(createRes.body.data.subscription.maxBranch).toBe(1);
    expect(createRes.body.data.subscription.maxWarehouse).toBe(1);
    expect(createRes.body.data.subscription.maxProduct).toBe(50);
    expect(createRes.body.data.subscription.maxCustomer).toBe(50);
    expect(createRes.body.data.subscription.storageLimitGB).toBe(1);
    const expiredAt = new Date(
      createRes.body.data.subscription.expiredAt,
    ).getTime();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    expect(expiredAt).toBeGreaterThanOrEqual(before + fourteenDaysMs);
    expect(expiredAt).toBeLessThanOrEqual(after + fourteenDaysMs);

    // Bằng chứng TRẠNG THÁI DATABASE THẬT — không chỉ đọc lại qua chính API vừa gọi.
    const subscription = await prisma.organizationSubscription.findUnique({
      where: { organizationId: createRes.body.data.id },
    });
    expect(subscription?.plan).toBe('TRIAL');
    expect(subscription?.maxUser).toBe(3);
  });

  // T053.02 CASE 5 — BASIC/PRO/ENTERPRISE không hồi quy khi chọn tường minh qua HTTP thật.
  it.each([
    [
      'BASIC',
      {
        maxUser: 5,
        maxBranch: 2,
        maxWarehouse: 2,
        maxProduct: 500,
        maxCustomer: null,
        storageLimitGB: 5,
      },
    ],
    [
      'PRO',
      {
        maxUser: 20,
        maxBranch: 10,
        maxWarehouse: 10,
        maxProduct: null,
        maxCustomer: null,
        storageLimitGB: 25,
      },
    ],
    [
      'ENTERPRISE',
      {
        maxUser: null,
        maxBranch: null,
        maxWarehouse: null,
        maxProduct: null,
        maxCustomer: null,
        storageLimitGB: null,
      },
    ],
  ] as const)(
    '%s: tạo Organization với plan tường minh, subscription persist đúng giới hạn D3, expiredAt null',
    async (plan, expected) => {
      const slug = `org-e2e-${plan.toLowerCase()}-${Date.now()}`;
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          organization: { displayName: `${plan} Co`, slug },
          owner: {
            fullName: `${plan} Owner`,
            email: `${plan.toLowerCase()}-owner-${Date.now()}@${plan.toLowerCase()}.com`,
            password: 'Password123',
          },
          subscription: { plan },
        })
        .expect(201);

      expect(createRes.body.data.subscription.plan).toBe(plan);
      expect(createRes.body.data.subscription.expiredAt).toBeNull();
      expect(createRes.body.data.subscription).toMatchObject(expected);
    },
  );

  it('NOT-PLATFORM-ADMIN: user thường không tạo được Organization', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        organization: { displayName: 'X', slug: `x-${Date.now()}` },
        owner: {
          fullName: 'X',
          email: `x-${Date.now()}@x.com`,
          password: 'Password123',
        },
      })
      .expect(403);
  });

  it('ORGANIZATION-CONTEXT: user thường không xem được Organization khác (Platform Admin thì được)', async () => {
    const otherOrgRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        organization: { displayName: 'Other Co', slug: `other-${Date.now()}` },
        owner: {
          fullName: 'Other Owner',
          email: `other-${Date.now()}@other.com`,
          password: 'Password123',
        },
      })
      .expect(201);
    const otherOrgId = otherOrgRes.body.data.id;

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${otherOrgId}`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${otherOrgId}`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .expect(200);
  });

  it('GET /organizations/current trả về đúng tổ chức của user đang đăng nhập', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .set('Authorization', `Bearer ${tenantToken}`)
      .expect(200);
    expect(res.body.data.id).toBe(tenantOrganizationId);
  });
});
