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
 * Integration Test — Purchase Return (Purchase → Return → Inventory Out → Debt Reduce)
 * với Postgres thật (Prompt 028). Cùng giới hạn với các *.e2e-spec.ts trước: KHÔNG tự
 * chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- purchase-return.e2e-spec.ts
 */
describe('PurchaseReturn Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let branchId: string;
  let warehouseId: string;
  let supplierId: string;
  let productId: string;

  async function createReceivedPurchaseOrder(
    quantity: number,
    unitCost: number,
  ) {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        supplierId,
        items: [{ productId, warehouseId, quantity, unitCost }],
      })
      .expect(201);
    const purchaseOrderId = created.body.data.id;
    const purchaseItemId = created.body.data.items[0].id;

    await request(app.getHttpServer())
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/receive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    return { purchaseOrderId, purchaseItemId };
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'purchase-return-e2e' },
      create: {
        code: 'PURCHASE-RETURN-E2E',
        displayName: 'PurchaseReturn E2E Org',
        slug: 'purchase-return-e2e',
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
      where: { organizationId_code: { organizationId, code: 'pr_e2e_role' } },
      create: {
        organizationId,
        code: 'pr_e2e_role',
        name: 'PurchaseReturn E2E Role',
      },
      update: {},
    });

    const purchaseReturnPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'purchase_return:' } },
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
      ...purchaseReturnPermissions,
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
        organizationId_email: { organizationId, email: 'pr-e2e@pos-erp.local' },
      },
      create: {
        organizationId,
        username: 'pr-e2e',
        email: 'pr-e2e@pos-erp.local',
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
      where: { organizationId_code: { organizationId, code: 'E2E-CAT-PR' } },
      create: {
        organizationId,
        code: 'E2E-CAT-PR',
        name: 'Danh mục E2E PR',
        slug: 'danh-muc-e2e-pr',
      },
      update: {},
    });

    const unit = await prisma.unit.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-UNIT-PR' } },
      create: {
        organizationId,
        code: 'E2E-UNIT-PR',
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
        name: `Sản phẩm purchase-return e2e ${Date.now()}`,
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

  it('luồng đầy đủ: create (DRAFT) → approve (APPROVED) → complete (COMPLETED) → Inventory Out + Debt Reduce', async () => {
    const { purchaseOrderId, purchaseItemId } =
      await createReceivedPurchaseOrder(20, 8000);

    const stockBefore = await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .query({ warehouseId, productId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(stockBefore.body.data.items[0].quantity).toBe('20');

    const createdReturn = await request(app.getHttpServer())
      .post('/api/v1/purchase-returns')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        purchaseOrderId,
        reason: 'DAMAGED',
        items: [{ purchaseItemId, quantity: 5 }],
      })
      .expect(201);
    const purchaseReturnId = createdReturn.body.data.id;
    expect(createdReturn.body.data.status).toBe('DRAFT');
    expect(createdReturn.body.data.totalAmount).toBe('40000');

    await request(app.getHttpServer())
      .patch(`/api/v1/purchase-returns/${purchaseReturnId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const completed = await request(app.getHttpServer())
      .patch(`/api/v1/purchase-returns/${purchaseReturnId}/complete`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(completed.body.data.status).toBe('COMPLETED');

    const stockAfter = await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .query({ warehouseId, productId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(stockAfter.body.data.items[0].quantity).toBe('15');

    const history = await request(app.getHttpServer())
      .get('/api/v1/inventory/history')
      .query({ warehouseId, productId, movementType: 'RETURN' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(history.body.data.total).toBe(1);
    expect(history.body.data.items[0].quantity).toBe('-5');
    expect(history.body.data.items[0].referenceId).toBe(purchaseReturnId);

    const debts = await prisma.debt.findMany({
      where: { refType: 'PurchaseReturn', refId: purchaseReturnId },
    });
    expect(debts).toHaveLength(1);
    expect(debts[0].type).toBe('PAYABLE');
    expect(debts[0].supplierId).toBe(supplierId);
    expect(debts[0].amount.toString()).toBe('-40000');
  });

  it('EXCEEDS-RECEIVED: từ chối tạo phiếu trả vượt quá số lượng đã nhận', async () => {
    const { purchaseOrderId, purchaseItemId } =
      await createReceivedPurchaseOrder(3, 1000);

    await request(app.getHttpServer())
      .post('/api/v1/purchase-returns')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        purchaseOrderId,
        reason: 'OTHER',
        items: [{ purchaseItemId, quantity: 999 }],
      })
      .expect(422);
  });

  it('ORDER-NOT-RECEIVED: từ chối tạo phiếu trả cho đơn nhập còn DRAFT', async () => {
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
      .post('/api/v1/purchase-returns')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        purchaseOrderId: created.body.data.id,
        reason: 'OTHER',
        items: [{ purchaseItemId: created.body.data.items[0].id, quantity: 1 }],
      })
      .expect(422);
  });

  it('CANCEL: hủy phiếu còn DRAFT thành công; không cho hủy lại phiếu đã CANCELLED', async () => {
    const { purchaseOrderId, purchaseItemId } =
      await createReceivedPurchaseOrder(4, 1000);

    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-returns')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        purchaseOrderId,
        reason: 'OTHER',
        items: [{ purchaseItemId, quantity: 1 }],
      })
      .expect(201);
    const purchaseReturnId = created.body.data.id;

    const cancelled = await request(app.getHttpServer())
      .patch(`/api/v1/purchase-returns/${purchaseReturnId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');

    await request(app.getHttpServer())
      .patch(`/api/v1/purchase-returns/${purchaseReturnId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(422);
  });

  it('GET /purchase-returns/:id trả về chi tiết; GET /purchase-returns hỗ trợ lọc theo purchaseOrderId', async () => {
    const { purchaseOrderId, purchaseItemId } =
      await createReceivedPurchaseOrder(2, 1000);

    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-returns')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        purchaseOrderId,
        reason: 'OTHER',
        items: [{ purchaseItemId, quantity: 1 }],
      })
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/purchase-returns/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(detail.body.data.id).toBe(created.body.data.id);

    const list = await request(app.getHttpServer())
      .get('/api/v1/purchase-returns')
      .query({ purchaseOrderId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      list.body.data.items.every(
        (pr: { purchaseOrderId: string }) =>
          pr.purchaseOrderId === purchaseOrderId,
      ),
    ).toBe(true);
  });
});
