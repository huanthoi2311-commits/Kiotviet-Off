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
 * Integration Test — Unit (đơn vị tính) CRUD + block-delete-khi-còn-Product với Postgres thật (Prompt 019).
 * Cùng giới hạn với brand.e2e-spec.ts: KHÔNG tự chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- unit.e2e-spec.ts
 */
describe('Unit Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let categoryId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'unit-e2e' },
      create: { name: 'Unit E2E Org', slug: 'unit-e2e' },
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
      where: { organizationId_code: { organizationId, code: 'unit_e2e_role' } },
      create: { organizationId, code: 'unit_e2e_role', name: 'Unit E2E Role' },
      update: {},
    });

    const unitPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'unit:' } },
    });
    const productPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'product:' } },
    });
    const allPermissions = [...unitPermissions, ...productPermissions];
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: allPermissions.map((p) => ({
        roleId: role.id,
        permissionId: p.id,
      })),
      skipDuplicates: true,
    });

    const passwordHash = await argon2.hash('E2ePass@123', {
      type: argon2.argon2id,
    });
    const user = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId,
          email: 'unit-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'unit-e2e',
        email: 'unit-e2e@pos-erp.local',
        passwordHash,
      },
      update: {},
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });

    const category = await prisma.category.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-CAT' } },
      create: {
        organizationId,
        code: 'E2E-CAT',
        name: 'Danh mục E2E',
        slug: 'danh-muc-e2e',
      },
      update: {},
    });
    categoryId = category.id;

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
      permissions: allPermissions.map((p) => p.code),
      permissionVersion: user.permissionVersion,
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('tạo, tìm kiếm và lấy chi tiết đơn vị tính', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `CAI-${Date.now()}`, name: 'Cái', symbol: 'cái' })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/units')
      .query({ search: 'Cái' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      listRes.body.data.items.some(
        (u: { id: string }) => u.id === created.body.data.id,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .get(`/api/v1/units/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('DUPLICATE: từ chối tạo trùng code trong cùng tổ chức', async () => {
    const code = `DUP-${Date.now()}`;
    await request(app.getHttpServer())
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code, name: 'Đơn vị gốc', symbol: 'x' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code, name: 'Đơn vị trùng', symbol: 'y' })
      .expect(409);
  });

  it('BLOCK-DELETE: từ chối xóa đơn vị tính đang có sản phẩm', async () => {
    const unitRes = await request(app.getHttpServer())
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: `BLOCK-${Date.now()}`,
        name: 'Đơn vị có sản phẩm',
        symbol: 'dv',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        categoryId,
        unitId: unitRes.body.data.id,
        name: 'Sản phẩm chặn xóa đơn vị tính',
        costPrice: 10000,
        prices: [{ type: 'RETAIL', price: 20000 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/units/${unitRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(422);
  });

  it('cập nhật và xóa mềm đơn vị tính không có sản phẩm hoạt động bình thường', async () => {
    const unitRes = await request(app.getHttpServer())
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: `LIFECYCLE-${Date.now()}`,
        name: 'Đơn vị vòng đời',
        symbol: 'dv',
      })
      .expect(201);
    const id = unitRes.body.data.id;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/units/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Đơn vị vòng đời (đã sửa)' })
      .expect(200);
    expect(updated.body.data.name).toBe('Đơn vị vòng đời (đã sửa)');

    await request(app.getHttpServer())
      .delete(`/api/v1/units/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/units/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });
});
