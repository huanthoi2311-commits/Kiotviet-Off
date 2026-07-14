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
 * Integration Test — Purchase Report (Dashboard + Breakdown theo 6 chiều + Export
 * Excel/CSV/PDF) với Postgres thật (Prompt 030). Cùng giới hạn với các *.e2e-spec.ts
 * trước: KHÔNG tự chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- purchase-report.e2e-spec.ts
 */
describe('PurchaseReport Module (e2e, integration)', () => {
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
  ): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        supplierId,
        items: [{ productId, warehouseId, quantity, unitCost }],
      })
      .expect(201);
    const purchaseOrderId = created.body.data.id as string;

    await request(app.getHttpServer())
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/receive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    return purchaseOrderId;
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'purchase-report-e2e' },
      create: { name: 'PurchaseReport E2E Org', slug: 'purchase-report-e2e' },
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
      where: { organizationId_code: { organizationId, code: 'prpt_e2e_role' } },
      create: {
        organizationId,
        code: 'prpt_e2e_role',
        name: 'PurchaseReport E2E Role',
      },
      update: {},
    });

    const reportPermissions = await prisma.permission.findMany({
      where: { code: { in: ['report:view', 'report:export'] } },
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
      ...reportPermissions,
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
        organizationId_email: {
          organizationId,
          email: 'prpt-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'prpt-e2e',
        email: 'prpt-e2e@pos-erp.local',
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
      where: { organizationId_code: { organizationId, code: 'E2E-CAT-PRPT' } },
      create: {
        organizationId,
        code: 'E2E-CAT-PRPT',
        name: 'Danh mục E2E PRPT',
        slug: 'danh-muc-e2e-prpt',
      },
      update: {},
    });

    const unit = await prisma.unit.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-UNIT-PRPT' } },
      create: {
        organizationId,
        code: 'E2E-UNIT-PRPT',
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
        name: `Sản phẩm purchase-report e2e ${Date.now()}`,
        costPrice: 10000,
        prices: [{ type: 'RETAIL', price: 20000 }],
      })
      .expect(201);
    productId = productRes.body.data.id;

    // 2 đơn nhập RECEIVED để có dữ liệu cho mọi chiều báo cáo (Supplier/Product/Warehouse/Month/User/Category).
    await createReceivedPurchaseOrder(10, 8000); // 80.000
    await createReceivedPurchaseOrder(5, 10000); // 50.000
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('DASHBOARD: Total Purchase, Average Cost, Top Supplier/Product, Monthly Purchase đúng', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/purchase-reports/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.totalAmount).toBe('130000');
    expect(res.body.data.totalOrders).toBe(2);
    // (10*8000 + 5*10000) / 15 = 130000/15 = 8666.666...
    expect(Number(res.body.data.averageCost)).toBeCloseTo(8666.6667, 2);
    expect(res.body.data.topSuppliers[0].code).toBe('E2E-NCC');
    expect(res.body.data.topSuppliers[0].totalAmount).toBe('130000');
    expect(res.body.data.topProducts).toHaveLength(1);
    expect(res.body.data.monthlyPurchase.length).toBeGreaterThanOrEqual(1);
  });

  it.each([
    ['SUPPLIER', 'E2E-NCC'],
    ['WAREHOUSE', 'E2E-WH'],
  ])(
    'BREAKDOWN theo %s trả về đúng code và tổng giá trị',
    async (groupBy, expectedCode) => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/purchase-reports/breakdown')
        .query({ groupBy })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].code).toBe(expectedCode);
      expect(res.body.data.items[0].totalAmount).toBe('130000');
      expect(res.body.data.items[0].orderCount).toBe(2);
    },
  );

  it('BREAKDOWN theo PRODUCT trả về đúng tổng số lượng', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/purchase-reports/breakdown')
      .query({ groupBy: 'PRODUCT' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].totalQuantity).toBe('15');
  });

  it('BREAKDOWN theo CATEGORY trả về đúng ngành hàng', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/purchase-reports/breakdown')
      .query({ groupBy: 'CATEGORY' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].code).toBe('E2E-CAT-PRPT');
  });

  it('BREAKDOWN theo MONTH gộp cả 2 đơn nhập cùng tháng hiện tại', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/purchase-reports/breakdown')
      .query({ groupBy: 'MONTH' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].totalAmount).toBe('130000');
    expect(res.body.data.items[0].orderCount).toBe(2);
  });

  it('BREAKDOWN theo USER trả về đúng người tạo đơn', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/purchase-reports/breakdown')
      .query({ groupBy: 'USER' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].code).toBe('prpt-e2e');
  });

  it('EXPORT EXCEL: trả về file .xlsx hợp lệ', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/purchase-reports/export')
      .query({ groupBy: 'SUPPLIER', format: 'EXCEL' })
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect((res.body as Buffer).subarray(0, 2).toString('ascii')).toBe('PK');
  });

  it('EXPORT CSV: trả về text/csv có dữ liệu', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/purchase-reports/export')
      .query({ groupBy: 'SUPPLIER', format: 'CSV' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('E2E-NCC');
  });

  it('EXPORT PDF: trả về file PDF hợp lệ', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/purchase-reports/export')
      .query({ groupBy: 'SUPPLIER', format: 'PDF' })
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(res.headers['content-type']).toBe('application/pdf');
    expect((res.body as Buffer).subarray(0, 4).toString('ascii')).toBe('%PDF');
  });
});
