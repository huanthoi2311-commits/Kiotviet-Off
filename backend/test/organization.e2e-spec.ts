import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
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
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    await app.init();

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
