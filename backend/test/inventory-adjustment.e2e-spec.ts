import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { INVENTORY_REPOSITORY } from '../src/modules/inventory/domain/repositories/inventory.repository.interface';
import type { IInventoryRepository } from '../src/modules/inventory/domain/repositories/inventory.repository.interface';
import { PERMISSION_CATALOG } from '../src/modules/rbac/infrastructure/permission-catalog';

/**
 * Integration Test — Inventory Adjustment (Draft→Submitted→Approved→Completed, sinh
 * InventoryMovement khi Complete, chặn âm tồn kho nếu Setting không cho phép) với
 * Postgres thật (Prompt 025). Cùng giới hạn với các *.e2e-spec.ts trước: KHÔNG tự chạy
 * được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- inventory-adjustment.e2e-spec.ts
 */
describe('InventoryAdjustment Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let warehouseId: string;
  let productId: string;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'inventory-adjustment-e2e' },
      create: {
        name: 'InventoryAdjustment E2E Org',
        slug: 'inventory-adjustment-e2e',
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
        organizationId_code: { organizationId, code: 'inv_adj_e2e_role' },
      },
      create: {
        organizationId,
        code: 'inv_adj_e2e_role',
        name: 'InventoryAdjustment E2E Role',
      },
      update: {},
    });

    const inventoryPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'inventory:' } },
    });
    const productPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'product:' } },
    });
    const allPermissions = [...inventoryPermissions, ...productPermissions];
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
          email: 'inv-adj-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'inv-adj-e2e',
        email: 'inv-adj-e2e@pos-erp.local',
        passwordHash,
      },
      update: {},
    });
    userId = user.id;
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

    const warehouse = await prisma.warehouse.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-WH' } },
      create: {
        organizationId,
        branchId: branch.id,
        code: 'E2E-WH',
        name: 'Kho E2E',
      },
      update: {},
    });
    warehouseId = warehouse.id;

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
        name: `Sản phẩm inventory-adjustment e2e ${Date.now()}`,
        costPrice: 10000,
        prices: [{ type: 'RETAIL', price: 20000 }],
      })
      .expect(201);
    productId = productRes.body.data.id;

    const inventoryRepository =
      app.get<IInventoryRepository>(INVENTORY_REPOSITORY);
    await inventoryRepository.recordMovement({
      organizationId,
      warehouseId,
      productId,
      movementType: 'INITIAL',
      referenceType: 'SYSTEM',
      quantity: 10,
      unitCost: 50000,
      createdBy: user.id,
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('luồng đầy đủ: tạo (LOST -5) → submit → approve → complete → sinh Movement ADJUSTMENT -5', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/inventory-adjustments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        warehouseId,
        reason: 'LOST',
        items: [
          { productId, quantity: -5, remark: 'Hàng hỏng khi vận chuyển' },
        ],
      })
      .expect(201);
    const adjustmentId = created.body.data.id;
    expect(created.body.data.status).toBe('DRAFT');

    await request(app.getHttpServer())
      .patch(`/api/v1/inventory-adjustments/${adjustmentId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/inventory-adjustments/${adjustmentId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const completed = await request(app.getHttpServer())
      .patch(`/api/v1/inventory-adjustments/${adjustmentId}/complete`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(completed.body.data.status).toBe('COMPLETED');

    const stock = await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .query({ warehouseId, productId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(stock.body.data.items[0].quantity).toBe('5');

    const history = await request(app.getHttpServer())
      .get('/api/v1/inventory/history')
      .query({ warehouseId, productId, movementType: 'ADJUSTMENT' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(history.body.data.total).toBe(1);
    expect(history.body.data.items[0].quantity).toBe('-5');
  });

  it('NEGATIVE-STOCK: từ chối Complete nếu sẽ âm tồn kho và chưa cấu hình cho phép', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/inventory-adjustments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        warehouseId,
        reason: 'DAMAGED',
        items: [{ productId, quantity: -999 }],
      })
      .expect(201);
    const adjustmentId = created.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/inventory-adjustments/${adjustmentId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/inventory-adjustments/${adjustmentId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/inventory-adjustments/${adjustmentId}/complete`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(422);
  });

  it('NEGATIVE-STOCK-ALLOWED: cho phép âm tồn kho khi Setting inventory.allowNegativeStock=true', async () => {
    await prisma.setting.upsert({
      where: {
        organizationId_branchId_key: {
          organizationId,
          branchId: null as unknown as string,
          key: 'inventory.allowNegativeStock',
        },
      },
      create: {
        organizationId,
        key: 'inventory.allowNegativeStock',
        value: true,
        createdBy: userId,
      },
      update: { value: true },
    });

    const created = await request(app.getHttpServer())
      .post('/api/v1/inventory-adjustments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        warehouseId,
        reason: 'DAMAGED',
        items: [{ productId, quantity: -999 }],
      })
      .expect(201);
    const adjustmentId = created.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/inventory-adjustments/${adjustmentId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/inventory-adjustments/${adjustmentId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const completed = await request(app.getHttpServer())
      .patch(`/api/v1/inventory-adjustments/${adjustmentId}/complete`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(completed.body.data.status).toBe('COMPLETED');
  });

  it('INVALID-TRANSITION: từ chối approve một phiếu còn ở DRAFT (chưa submit)', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/inventory-adjustments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        warehouseId,
        reason: 'OTHER',
        items: [{ productId, quantity: 1 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/inventory-adjustments/${created.body.data.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(422);
  });

  it('GET /inventory-adjustments hỗ trợ lọc theo reason', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/inventory-adjustments')
      .query({ reason: 'LOST' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      res.body.data.items.every((a: { reason: string }) => a.reason === 'LOST'),
    ).toBe(true);
  });
});
