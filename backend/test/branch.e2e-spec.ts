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
 * Integration Test — Branch Module (SPEC-BRANCH-001, Sprint-00/T003): CRUD, set-default (chỉ
 * 1 Branch mặc định/Organization), Archive chặn khi còn Warehouse ACTIVE hoặc là Branch ACTIVE
 * cuối cùng. Cùng giới hạn với các *.e2e-spec.ts trước: KHÔNG tự chạy được trong sandbox này
 * (thiếu Docker).
 *   npm run test:e2e -- branch.e2e-spec.ts
 */
describe('Branch Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let existingBranchId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'branch-e2e' },
      create: {
        code: 'ORG-BRANCH-E2E',
        displayName: 'Branch E2E Org',
        slug: 'branch-e2e',
      },
      update: {},
    });
    organizationId = organization.id;

    for (const permission of PERMISSION_CATALOG) {
      await prisma.permission.upsert({
        where: { code: permission.code },
        create: permission,
        update: {},
      });
    }

    const role = await prisma.role.upsert({
      where: {
        organizationId_code: { organizationId, code: 'branch_e2e_role' },
      },
      create: {
        organizationId,
        code: 'branch_e2e_role',
        name: 'Branch E2E Role',
      },
      update: {},
    });
    const permissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'branch:' } },
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
          email: 'branch-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'branch-e2e',
        email: 'branch-e2e@pos-erp.local',
        passwordHash,
      },
      update: {},
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });

    // Branch có sẵn từ trước — cần thiết để test "Không được Archive Branch cuối cùng"
    // (mọi Organization phải có sẵn ít nhất 1 Branch ACTIVE để bắt đầu, đúng Business Rule).
    const existingBranch = await prisma.branch.upsert({
      where: { organizationId_code: { organizationId, code: 'BR-EXISTING' } },
      create: { organizationId, code: 'BR-EXISTING', name: 'Chi nhánh có sẵn' },
      update: {},
    });
    existingBranchId = existingBranch.id;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    await app.init();

    accessToken = app.get(JwtService).sign({
      sub: user.id,
      organizationId,
      branchId: null,
      email: user.email,
      permissions: permissions.map((p) => p.code),
      permissionVersion: user.permissionVersion,
      isPlatformAdmin: false,
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('luồng đầy đủ: tạo → GET → PATCH → set-default → archive', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Chi nhánh Hà Nội', invoicePrefix: `HN-${Date.now()}` })
      .expect(201);
    expect(createRes.body.data.code).toMatch(/^BR\d{6}$/);
    expect(createRes.body.data.status).toBe('ACTIVE');
    const branchId = createRes.body.data.id;

    await request(app.getHttpServer())
      .get(`/api/v1/branches/${branchId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/branches/${branchId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Chi nhánh Hà Nội (Updated)' })
      .expect(200);

    const setDefaultRes = await request(app.getHttpServer())
      .post(`/api/v1/branches/${branchId}/set-default`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(setDefaultRes.body.data.isMain).toBe(true);

    // Branch có sẵn (BR-EXISTING) phải bị bỏ isMain khi branch này được set default
    const existingRes = await request(app.getHttpServer())
      .get(`/api/v1/branches/${existingBranchId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(existingRes.body.data.isMain).toBe(false);

    const archiveRes = await request(app.getHttpServer())
      .post(`/api/v1/branches/${branchId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(archiveRes.body.data.status).toBe('ARCHIVED');
    expect(archiveRes.body.data.isMain).toBe(false);
  });

  it('MIN-ONE-ACTIVE: từ chối Archive Branch ACTIVE cuối cùng của Organization', async () => {
    // Sau test trước, chỉ còn BR-EXISTING đang ACTIVE trong tổ chức này.
    await request(app.getHttpServer())
      .post(`/api/v1/branches/${existingBranchId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(409);
  });

  it('INVOICE-PREFIX-CONFLICT: từ chối invoicePrefix trùng trong cùng Organization', async () => {
    const prefix = `DUP-${Date.now()}`;
    await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Chi nhánh A', invoicePrefix: prefix })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Chi nhánh B', invoicePrefix: prefix })
      .expect(409);
  });

  it('HAS-ACTIVE-WAREHOUSE: từ chối Archive Branch còn Warehouse ACTIVE', async () => {
    const branchRes = await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Chi nhánh có kho' })
      .expect(201);
    const branchId = branchRes.body.data.id;

    await prisma.warehouse.create({
      data: {
        organizationId,
        branchId,
        code: `WH-BRANCH-E2E-${Date.now()}`,
        name: 'Kho chi nhánh',
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/branches/${branchId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(409);
  });
});
