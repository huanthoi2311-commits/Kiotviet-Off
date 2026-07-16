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
 * Integration Test — Brand CRUD + block-delete-khi-còn-Product với Postgres thật (Prompt 018).
 * Cùng giới hạn với product.e2e-spec.ts: KHÔNG tự chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- brand.e2e-spec.ts
 */
describe('Brand Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let categoryId: string;
  let unitId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'brand-e2e' },
      create: {
        code: 'BRAND-E2E',
        displayName: 'Brand E2E Org',
        slug: 'brand-e2e',
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
        organizationId_code: { organizationId, code: 'brand_e2e_role' },
      },
      create: {
        organizationId,
        code: 'brand_e2e_role',
        name: 'Brand E2E Role',
      },
      update: {},
    });

    const brandPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'brand:' } },
    });
    const productPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'product:' } },
    });
    const allPermissions = [...brandPermissions, ...productPermissions];
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
          email: 'brand-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'brand-e2e',
        email: 'brand-e2e@pos-erp.local',
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

    const unit = await prisma.unit.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-UNIT' } },
      create: { organizationId, code: 'E2E-UNIT', name: 'Cái', symbol: 'cái' },
      update: {},
    });
    unitId = unit.id;

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

  it('tạo, tìm kiếm và lấy chi tiết thương hiệu', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `NIKE-${Date.now()}`, name: 'Nike', country: 'USA' })
      .expect(201);

    expect(created.body.data.status).toBe('ACTIVE');

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/brands')
      .query({ search: 'Nike' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      listRes.body.data.items.some(
        (b: { id: string }) => b.id === created.body.data.id,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .get(`/api/v1/brands/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('DUPLICATE: từ chối tạo trùng code trong cùng tổ chức', async () => {
    const code = `DUP-${Date.now()}`;
    await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code, name: 'Thương hiệu gốc' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code, name: 'Thương hiệu trùng' })
      .expect(409);
  });

  it('BLOCK-DELETE: từ chối xóa thương hiệu đang có sản phẩm', async () => {
    const brandRes = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `BLOCK-${Date.now()}`, name: 'Thương hiệu có sản phẩm' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        categoryId,
        brandId: brandRes.body.data.id,
        unitId,
        name: 'Sản phẩm chặn xóa thương hiệu',
        costPrice: 10000,
        prices: [{ type: 'RETAIL', price: 20000 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/brands/${brandRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(422);
  });

  it('cập nhật và xóa mềm thương hiệu không có sản phẩm hoạt động bình thường', async () => {
    const brandRes = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `LIFECYCLE-${Date.now()}`, name: 'Thương hiệu vòng đời' })
      .expect(201);
    const id = brandRes.body.data.id;
    expect(brandRes.body.data.version).toBe(1);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/brands/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1, name: 'Thương hiệu vòng đời (đã sửa)' })
      .expect(200);
    expect(updated.body.data.name).toBe('Thương hiệu vòng đời (đã sửa)');
    expect(updated.body.data.version).toBe(2);

    await request(app.getHttpServer())
      .delete(`/api/v1/brands/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/brands/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('OPTIMISTIC LOCK: PATCH với version cũ bị từ chối 409', async () => {
    const brandRes = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `LOCK-${Date.now()}`, name: 'Thương hiệu khóa' })
      .expect(201);
    const id = brandRes.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/brands/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1, name: 'Sửa lần 1' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/brands/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1, name: 'Sửa lần 2 (version cũ)' })
      .expect(409);
  });

  it('RESTORE: khôi phục thương hiệu đã xóa mềm luôn trả status về INACTIVE', async () => {
    const brandRes = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: `RESTORE-${Date.now()}`,
        name: 'Thương hiệu khôi phục',
        status: 'ACTIVE',
      })
      .expect(201);
    const id = brandRes.body.data.id;

    await request(app.getHttpServer())
      .delete(`/api/v1/brands/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/brands/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    const restored = await request(app.getHttpServer())
      .post(`/api/v1/brands/${id}/restore`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(restored.body.data.status).toBe('INACTIVE');

    await request(app.getHttpServer())
      .get(`/api/v1/brands/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/brands/${id}/restore`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(422);
  });

  it('isActive FILTER: lọc theo status=ACTIVE qua alias isActive, không có cột isActive riêng', async () => {
    const activeRes = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: `ISACTIVE-${Date.now()}`,
        name: 'Thương hiệu đang hoạt động',
        status: 'ACTIVE',
      })
      .expect(201);
    const inactiveRes = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: `ISACTIVE-OFF-${Date.now()}`,
        name: 'Thương hiệu ngưng hoạt động',
        status: 'INACTIVE',
      })
      .expect(201);

    const activeList = await request(app.getHttpServer())
      .get('/api/v1/brands')
      .query({ isActive: true })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const activeIds = activeList.body.data.items.map(
      (b: { id: string }) => b.id,
    );
    expect(activeIds).toContain(activeRes.body.data.id);
    expect(activeIds).not.toContain(inactiveRes.body.data.id);
  });
});
