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
 * Integration Test — Warehouse CRUD + restore + block-delete-khi-có-tồn-kho/giao-dịch
 * với Postgres thật (Prompt 021). Cùng giới hạn với các *.e2e-spec.ts trước: KHÔNG tự
 * chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- warehouse.e2e-spec.ts
 */
describe('Warehouse Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let branchId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'warehouse-e2e' },
      create: { name: 'Warehouse E2E Org', slug: 'warehouse-e2e' },
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
        organizationId_code: { organizationId, code: 'warehouse_e2e_role' },
      },
      create: {
        organizationId,
        code: 'warehouse_e2e_role',
        name: 'Warehouse E2E Role',
      },
      update: {},
    });

    const warehousePermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'warehouse:' } },
    });
    const productPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'product:' } },
    });
    const allPermissions = [...warehousePermissions, ...productPermissions];
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
          email: 'warehouse-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'warehouse-e2e',
        email: 'warehouse-e2e@pos-erp.local',
        passwordHash,
      },
      update: {},
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });

    const branch = await prisma.branch.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-BRANCH' } },
      create: { organizationId, code: 'E2E-BRANCH', name: 'Chi nhánh E2E' },
      update: {},
    });
    branchId = branch.id;

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

    const unit = await prisma.unit.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-UNIT' } },
      create: { organizationId, code: 'E2E-UNIT', name: 'Cái', symbol: 'cái' },
      update: {},
    });

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

    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        categoryId: category.id,
        unitId: unit.id,
        name: `Sản phẩm warehouse e2e ${Date.now()}`,
        costPrice: 10000,
        prices: [{ type: 'RETAIL', price: 20000 }],
      })
      .expect(201);
    productId = productRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('tạo, tìm kiếm và lấy chi tiết kho', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        code: `KHO-${Date.now()}`,
        name: 'Kho Chính Hà Nội',
        type: 'MAIN',
      })
      .expect(201);
    expect(created.body.data.status).toBe('ACTIVE');

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .query({ search: 'Kho Chính' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      listRes.body.data.items.some(
        (w: { id: string }) => w.id === created.body.data.id,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .get(`/api/v1/warehouses/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('DUPLICATE: từ chối tạo trùng code trong cùng tổ chức', async () => {
    const code = `DUP-${Date.now()}`;
    await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, code, name: 'Kho gốc' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, code, name: 'Kho trùng' })
      .expect(409);
  });

  it('BRANCH-NOT-FOUND: từ chối tạo kho với branchId không tồn tại', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId: '00000000-0000-4000-8000-000000000000',
        code: `NOBRANCH-${Date.now()}`,
        name: 'Kho không có chi nhánh',
      })
      .expect(400);
  });

  it('BLOCK-DELETE: từ chối xóa kho đang có tồn kho', async () => {
    const warehouseRes = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, code: `STOCK-${Date.now()}`, name: 'Kho có tồn kho' })
      .expect(201);

    await prisma.inventory.create({
      data: {
        organizationId,
        warehouseId: warehouseRes.body.data.id,
        productId,
        quantity: 10,
      },
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/warehouses/${warehouseRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(422);
  });

  it('cập nhật, xóa mềm và khôi phục kho không có tồn kho hoạt động bình thường', async () => {
    const warehouseRes = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, code: `LIFECYCLE-${Date.now()}`, name: 'Kho vòng đời' })
      .expect(201);
    const id = warehouseRes.body.data.id;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/warehouses/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Kho vòng đời (đã sửa)' })
      .expect(200);
    expect(updated.body.data.name).toBe('Kho vòng đời (đã sửa)');

    await request(app.getHttpServer())
      .delete(`/api/v1/warehouses/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/warehouses/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/warehouses/${id}/restore`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/warehouses/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });
});
