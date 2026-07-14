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
 * Integration Test — Stock Transfer (Approve trừ kho nguồn, Receive cộng kho đích,
 * Cancel hoàn kho nếu đã Approve) với Postgres thật (Prompt 023). Cùng giới hạn với
 * các *.e2e-spec.ts trước: KHÔNG tự chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- transfer.e2e-spec.ts
 */
describe('Transfer Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let warehouseAId: string;
  let warehouseBId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'transfer-e2e' },
      create: { name: 'Transfer E2E Org', slug: 'transfer-e2e' },
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
        organizationId_code: { organizationId, code: 'transfer_e2e_role' },
      },
      create: {
        organizationId,
        code: 'transfer_e2e_role',
        name: 'Transfer E2E Role',
      },
      update: {},
    });

    const transferPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'transfer:' } },
    });
    const inventoryPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'inventory:' } },
    });
    const productPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'product:' } },
    });
    const allPermissions = [
      ...transferPermissions,
      ...inventoryPermissions,
      ...productPermissions,
    ];
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
          email: 'transfer-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'transfer-e2e',
        email: 'transfer-e2e@pos-erp.local',
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

    const warehouseA = await prisma.warehouse.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-WH-A' } },
      create: {
        organizationId,
        branchId: branch.id,
        code: 'E2E-WH-A',
        name: 'Kho A',
      },
      update: {},
    });
    warehouseAId = warehouseA.id;

    const warehouseB = await prisma.warehouse.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-WH-B' } },
      create: {
        organizationId,
        branchId: branch.id,
        code: 'E2E-WH-B',
        name: 'Kho B',
      },
      update: {},
    });
    warehouseBId = warehouseB.id;

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
        name: `Sản phẩm transfer e2e ${Date.now()}`,
        costPrice: 10000,
        prices: [{ type: 'RETAIL', price: 20000 }],
      })
      .expect(201);
    productId = productRes.body.data.id;

    const inventoryRepository =
      app.get<IInventoryRepository>(INVENTORY_REPOSITORY);
    await inventoryRepository.recordMovement({
      organizationId,
      warehouseId: warehouseAId,
      productId,
      movementType: 'INITIAL',
      referenceType: 'SYSTEM',
      quantity: 100,
      unitCost: 50000,
      createdBy: user.id,
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('SAME-WAREHOUSE: từ chối tạo phiếu khi kho nguồn = kho đích', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fromWarehouseId: warehouseAId,
        toWarehouseId: warehouseAId,
        items: [{ productId, quantity: 10 }],
      })
      .expect(422);
  });

  it('luồng đầy đủ: tạo → approve (trừ Kho A) → receive (cộng Kho B với đúng avgCost)', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fromWarehouseId: warehouseAId,
        toWarehouseId: warehouseBId,
        items: [{ productId, quantity: 30 }],
      })
      .expect(201);
    const transferId = created.body.data.id;
    expect(created.body.data.status).toBe('PENDING');

    await request(app.getHttpServer())
      .patch(`/api/v1/transfers/${transferId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const stockAAfterApprove = await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .query({ warehouseId: warehouseAId, productId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(stockAAfterApprove.body.data.items[0].quantity).toBe('70');

    const receiveRes = await request(app.getHttpServer())
      .patch(`/api/v1/transfers/${transferId}/receive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(receiveRes.body.data.status).toBe('RECEIVED');

    const stockB = await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .query({ warehouseId: warehouseBId, productId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(stockB.body.data.items[0].quantity).toBe('30');
    expect(stockB.body.data.items[0].avgCost).toBe('50000');
  });

  it('INVALID-TRANSITION: từ chối approve một phiếu đã RECEIVED', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fromWarehouseId: warehouseAId,
        toWarehouseId: warehouseBId,
        items: [{ productId, quantity: 5 }],
      })
      .expect(201);
    const transferId = created.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/transfers/${transferId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/transfers/${transferId}/receive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/transfers/${transferId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(422);
  });

  it('CANCEL-AFTER-APPROVE: hủy phiếu đã approve hoàn lại đúng số lượng cho Kho nguồn', async () => {
    const stockBefore = await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .query({ warehouseId: warehouseAId, productId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const quantityBefore = Number(stockBefore.body.data.items[0].quantity);

    const created = await request(app.getHttpServer())
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fromWarehouseId: warehouseAId,
        toWarehouseId: warehouseBId,
        items: [{ productId, quantity: 15 }],
      })
      .expect(201);
    const transferId = created.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/transfers/${transferId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const cancelRes = await request(app.getHttpServer())
      .patch(`/api/v1/transfers/${transferId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED');

    const stockAfter = await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .query({ warehouseId: warehouseAId, productId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(Number(stockAfter.body.data.items[0].quantity)).toBe(quantityBefore);
  });

  it('GET /transfers hỗ trợ lọc theo status', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/transfers')
      .query({ status: 'CANCELLED' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      res.body.data.items.every(
        (t: { status: string }) => t.status === 'CANCELLED',
      ),
    ).toBe(true);
  });
});
