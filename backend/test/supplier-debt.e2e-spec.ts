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
 * Integration Test — Supplier Debt (Purchase increases Debt, Payment decreases Debt,
 * Return decreases Debt; Debt luôn khớp) với Postgres thật (Prompt 029). Cùng giới hạn
 * với các *.e2e-spec.ts trước: KHÔNG tự chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- supplier-debt.e2e-spec.ts
 */
describe('SupplierDebt Module (e2e, integration)', () => {
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

  async function getSupplierBalance(): Promise<string> {
    const res = await request(app.getHttpServer())
      .get('/api/v1/supplier-debt')
      .query({ supplierId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const items = res.body.data.items as { balance: string }[];
    return items[0].balance;
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'supplier-debt-e2e' },
      create: {
        code: 'SUPPLIER-DEBT-E2E',
        displayName: 'SupplierDebt E2E Org',
        slug: 'supplier-debt-e2e',
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
      where: { organizationId_code: { organizationId, code: 'sd_e2e_role' } },
      create: {
        organizationId,
        code: 'sd_e2e_role',
        name: 'SupplierDebt E2E Role',
      },
      update: {},
    });

    const debtPermissions = await prisma.permission.findMany({
      where: { code: { in: ['debt:view', 'payment:create'] } },
    });
    const purchasePermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'purchase:' } },
    });
    const purchaseReturnPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'purchase_return:' } },
    });
    const productPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'product:' } },
    });
    const inventoryPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'inventory:' } },
    });
    const allPermissions = [
      ...debtPermissions,
      ...purchasePermissions,
      ...purchaseReturnPermissions,
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
        organizationId_email: { organizationId, email: 'sd-e2e@pos-erp.local' },
      },
      create: {
        organizationId,
        username: 'sd-e2e',
        email: 'sd-e2e@pos-erp.local',
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
      where: { organizationId_code: { organizationId, code: 'E2E-CAT-SD' } },
      create: {
        organizationId,
        code: 'E2E-CAT-SD',
        name: 'Danh mục E2E SD',
        slug: 'danh-muc-e2e-sd',
      },
      update: {},
    });

    const unit = await prisma.unit.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-UNIT-SD' } },
      create: {
        organizationId,
        code: 'E2E-UNIT-SD',
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
        name: `Sản phẩm supplier-debt e2e ${Date.now()}`,
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

  it('PURCHASE-INCREASES-DEBT: nhận hàng ghi công nợ đúng bằng totalAmount đơn nhập', async () => {
    await createReceivedPurchaseOrder(10, 8000);
    await expect(getSupplierBalance()).resolves.toBe('80000');
  });

  it('PAYMENT-DECREASES-DEBT: thanh toán làm giảm đúng công nợ hiện tại', async () => {
    const balanceBefore = await getSupplierBalance();

    await request(app.getHttpServer())
      .post('/api/v1/supplier-payment')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        supplierId,
        method: 'CASH',
        amount: 30000,
        paidAt: new Date().toISOString(),
      })
      .expect(201);

    const balanceAfter = await getSupplierBalance();
    expect(Number(balanceBefore) - Number(balanceAfter)).toBe(30000);
  });

  it('EXCEEDS-BALANCE: từ chối thanh toán vượt quá công nợ hiện tại', async () => {
    const balance = await getSupplierBalance();

    await request(app.getHttpServer())
      .post('/api/v1/supplier-payment')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        supplierId,
        method: 'CASH',
        amount: Number(balance) + 1000000,
        paidAt: new Date().toISOString(),
      })
      .expect(422);
  });

  it('RETURN-DECREASES-DEBT: hoàn tất Purchase Return làm giảm đúng công nợ', async () => {
    const balanceBefore = await getSupplierBalance();
    const { purchaseOrderId, purchaseItemId } =
      await createReceivedPurchaseOrder(5, 2000);
    const balanceAfterPurchase = await getSupplierBalance();
    expect(Number(balanceAfterPurchase) - Number(balanceBefore)).toBe(10000);

    const createdReturn = await request(app.getHttpServer())
      .post('/api/v1/purchase-returns')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        purchaseOrderId,
        reason: 'DAMAGED',
        items: [{ purchaseItemId, quantity: 2 }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/purchase-returns/${createdReturn.body.data.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/purchase-returns/${createdReturn.body.data.id}/complete`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const balanceAfterReturn = await getSupplierBalance();
    expect(Number(balanceAfterPurchase) - Number(balanceAfterReturn)).toBe(
      4000,
    );
  });

  it('GET /supplier-debt hỗ trợ tìm theo mã/tên nhà cung cấp', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/supplier-debt')
      .query({ search: 'E2E-NCC' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      res.body.data.items.some(
        (item: { supplierId: string }) => item.supplierId === supplierId,
      ),
    ).toBe(true);
  });
});
