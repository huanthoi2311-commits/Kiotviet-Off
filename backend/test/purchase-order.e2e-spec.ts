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
 * Integration Test — Purchase Order (Draft→Approve→Receive, sinh InventoryMovement
 * PURCHASE + Average Cost đúng, Transaction Purchase+Inventory+Movement, Cancel) với
 * Postgres thật (Prompt 027). Cùng giới hạn với các *.e2e-spec.ts trước: KHÔNG tự chạy
 * được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- purchase-order.e2e-spec.ts
 */
describe('PurchaseOrder Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let branchId: string;
  let warehouseId: string;
  let supplierId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'purchase-order-e2e' },
      create: {
        code: 'PURCHASE-ORDER-E2E',
        displayName: 'PurchaseOrder E2E Org',
        slug: 'purchase-order-e2e',
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
      where: { organizationId_code: { organizationId, code: 'po_e2e_role' } },
      create: {
        organizationId,
        code: 'po_e2e_role',
        name: 'PurchaseOrder E2E Role',
      },
      update: {},
    });

    const purchasePermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'purchase:' } },
    });
    const productPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'product:' } },
    });
    const inventoryPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'inventory:' } },
    });
    const allPermissions = [
      ...purchasePermissions,
      ...productPermissions,
      ...inventoryPermissions,
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
        organizationId_email: { organizationId, email: 'po-e2e@pos-erp.local' },
      },
      create: {
        organizationId,
        username: 'po-e2e',
        email: 'po-e2e@pos-erp.local',
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

    const supplier = await prisma.supplier.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-NCC' } },
      create: {
        organizationId,
        code: 'E2E-NCC',
        companyName: 'Nhà cung cấp E2E',
      },
      update: {},
    });
    supplierId = supplier.id;

    const category = await prisma.category.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-CAT-PO' } },
      create: {
        organizationId,
        code: 'E2E-CAT-PO',
        name: 'Danh mục E2E PO',
        slug: 'danh-muc-e2e-po',
      },
      update: {},
    });

    const unit = await prisma.unit.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-UNIT-PO' } },
      create: {
        organizationId,
        code: 'E2E-UNIT-PO',
        name: 'Cái',
        symbol: 'cái',
      },
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
        name: `Sản phẩm purchase-order e2e ${Date.now()}`,
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

  it('luồng đầy đủ: create (DRAFT) → approve (APPROVED) → receive (RECEIVED) → sinh Movement PURCHASE + Average Cost đúng', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        supplierId,
        items: [
          {
            productId,
            warehouseId,
            quantity: 10,
            unitCost: 8000,
          },
        ],
      })
      .expect(201);
    const purchaseOrderId = created.body.data.id;
    expect(created.body.data.status).toBe('DRAFT');
    expect(created.body.data.totalAmount).toBe('80000');

    await request(app.getHttpServer())
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const received = await request(app.getHttpServer())
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/receive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(received.body.data.status).toBe('RECEIVED');
    expect(received.body.data.items[0].receivedQuantity).toBe('10');

    const stock = await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .query({ warehouseId, productId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(stock.body.data.items[0].quantity).toBe('10');
    expect(stock.body.data.items[0].avgCost).toBe('8000');

    const history = await request(app.getHttpServer())
      .get('/api/v1/inventory/history')
      .query({ warehouseId, productId, movementType: 'PURCHASE' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(history.body.data.total).toBe(1);
    expect(history.body.data.items[0].quantity).toBe('10');
    expect(history.body.data.items[0].referenceId).toBe(purchaseOrderId);

    const debts = await prisma.debt.findMany({
      where: { refType: 'PurchaseOrder', refId: purchaseOrderId },
    });
    expect(debts).toHaveLength(1);
    expect(debts[0].type).toBe('PAYABLE');
    expect(debts[0].supplierId).toBe(supplierId);
    expect(debts[0].amount.toString()).toBe('80000');
  });

  it('INVALID-TRANSITION: từ chối receive khi đơn còn ở DRAFT (chưa approve)', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        supplierId,
        items: [{ productId, warehouseId, quantity: 5, unitCost: 1000 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/purchase-orders/${created.body.data.id}/receive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(422);
  });

  it('CANCEL: hủy đơn còn DRAFT thành công; không cho hủy lại đơn đã CANCELLED', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        supplierId,
        items: [{ productId, warehouseId, quantity: 3, unitCost: 500 }],
      })
      .expect(201);
    const purchaseOrderId = created.body.data.id;

    const cancelled = await request(app.getHttpServer())
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');

    await request(app.getHttpServer())
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(422);
  });

  it('CANCEL-AFTER-RECEIVE: không cho hủy đơn đã RECEIVED', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        supplierId,
        items: [{ productId, warehouseId, quantity: 2, unitCost: 1000 }],
      })
      .expect(201);
    const purchaseOrderId = created.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/receive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(422);
  });

  it('GET /purchase-orders/:id trả về chi tiết; GET /purchase-orders hỗ trợ lọc theo supplierId', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        supplierId,
        items: [{ productId, warehouseId, quantity: 1, unitCost: 100 }],
      })
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/purchase-orders/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(detail.body.data.id).toBe(created.body.data.id);

    const list = await request(app.getHttpServer())
      .get('/api/v1/purchase-orders')
      .query({ supplierId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      list.body.data.items.every(
        (po: { supplierId: string }) => po.supplierId === supplierId,
      ),
    ).toBe(true);
  });
});
