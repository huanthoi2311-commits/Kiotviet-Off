import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './helpers/create-e2e-app';
import { AppModule } from '../src/app.module';
import { PERMISSION_CATALOG } from '../src/modules/rbac/infrastructure/permission-catalog';

/**
 * T052.01 — real-Postgres concurrency regression for `SupplierDebtService.createPayment()`.
 * Proves the `pg_advisory_xact_lock` fix (T052.01A/B) actually CLOSES the previously-confirmed
 * overpayment race, not merely narrows its window — a mocked Prisma client cannot exhibit the
 * real race (see `prisma-supplier-debt.repository.spec.ts` for the mock-level call-order proof,
 * which is necessary but not sufficient). Fires genuinely concurrent HTTP requests (`Promise.all`
 * against the real running app) so this is also the real-HTTP-reachability proof required by
 * T052.01A §8/§14 finding 5 (POST /supplier-payment is a real, permission-gated API today,
 * independent of any future UI).
 *
 * KHÔNG tự chạy được trong sandbox này (thiếu Docker/PostgreSQL) — cùng giới hạn với các
 * *.e2e-spec.ts khác trong repo. Chạy trong CI qua `npm run test:e2e`.
 */
describe('SupplierPayment Concurrency (e2e, integration — Postgres thật)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  interface OrgFixture {
    organizationId: string;
    branchId: string;
    warehouseId: string;
    supplierId: string;
    productId: string;
    accessToken: string;
  }

  let orgA: OrgFixture;
  let orgB: OrgFixture;

  async function setupOrganization(
    slug: string,
    code: string,
  ): Promise<OrgFixture> {
    const organization = await prisma.organization.upsert({
      where: { slug },
      create: { code, displayName: `${code} Org`, slug },
      update: {},
    });
    const organizationId = organization.id;

    for (const permission of PERMISSION_CATALOG) {
      await prisma.permission.upsert({
        where: { code: permission.code },
        create: permission,
        update: {},
      });
    }

    const role = await prisma.role.upsert({
      where: { organizationId_code: { organizationId, code: 'spc_e2e_role' } },
      create: { organizationId, code: 'spc_e2e_role', name: 'SPC E2E Role' },
      update: {},
    });

    const debtPermissions = await prisma.permission.findMany({
      where: { code: { in: ['debt:view', 'payment:create'] } },
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
      ...debtPermissions,
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
          email: `${slug}@pos-erp.local`,
        },
      },
      create: {
        organizationId,
        username: slug,
        email: `${slug}@pos-erp.local`,
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
      where: { organizationId_code: { organizationId, code: `${code}-BR` } },
      create: { organizationId, code: `${code}-BR`, name: `${code} Branch` },
      update: {},
    });

    const warehouse = await prisma.warehouse.upsert({
      where: { organizationId_code: { organizationId, code: `${code}-WH` } },
      create: {
        organizationId,
        branchId: branch.id,
        code: `${code}-WH`,
        name: `${code} Warehouse`,
      },
      update: {},
    });

    const supplier = await prisma.supplier.upsert({
      where: { organizationId_code: { organizationId, code: `${code}-NCC` } },
      create: {
        organizationId,
        code: `${code}-NCC`,
        companyName: `${code} NCC`,
      },
      update: {},
    });

    const category = await prisma.category.upsert({
      where: { organizationId_code: { organizationId, code: `${code}-CAT` } },
      create: {
        organizationId,
        code: `${code}-CAT`,
        name: `${code} Category`,
        slug: `${slug}-cat`,
      },
      update: {},
    });

    const unit = await prisma.unit.upsert({
      where: { organizationId_code: { organizationId, code: `${code}-UNIT` } },
      create: {
        organizationId,
        code: `${code}-UNIT`,
        name: 'Cái',
        symbol: 'cái',
      },
      update: {},
    });

    const accessToken = app.get(JwtService).sign({
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
        type: 'STANDARD',
        categoryId: category.id,
        unitId: unit.id,
        name: `${code} Product ${Date.now()}`,
        costPrice: 1000,
        prices: [{ type: 'RETAIL', price: 2000 }],
      })
      .expect(201);

    return {
      organizationId,
      branchId: branch.id,
      warehouseId: warehouse.id,
      supplierId: supplier.id,
      productId: productRes.body.data.id,
      accessToken,
    };
  }

  /** Nhận hàng (create→approve→receive) — mỗi lần gọi tạo 1 PO MỚI (version luôn bắt đầu từ 1). */
  async function receivePurchaseOrder(
    fixture: OrgFixture,
    quantity: number,
    unitCost: number,
  ): Promise<void> {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .send({
        branchId: fixture.branchId,
        supplierId: fixture.supplierId,
        items: [
          {
            productId: fixture.productId,
            warehouseId: fixture.warehouseId,
            quantity,
            unitCost,
          },
        ],
      })
      .expect(201);
    const purchaseOrderId = created.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/approve`)
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/receive`)
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .send({ version: 1 })
      .expect(200);
  }

  async function getBalance(fixture: OrgFixture): Promise<number> {
    const res = await request(app.getHttpServer())
      .get('/api/v1/supplier-debt')
      .query({ supplierId: fixture.supplierId })
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .expect(200);
    const items = res.body.data.items as { balance: string }[];
    return items.length > 0 ? Number(items[0].balance) : 0;
  }

  /** Bơm thêm Debt (qua 1 Purchase Order mới, unitCost=1) để balance hiện tại đạt đúng target —
   * mỗi test case tự thiết lập baseline riêng, không phụ thuộc thứ tự chạy trước đó. */
  async function topUpBalance(
    fixture: OrgFixture,
    target: number,
  ): Promise<void> {
    const current = await getBalance(fixture);
    const shortfall = target - current;
    if (shortfall <= 0) return;
    await receivePurchaseOrder(fixture, shortfall, 1);
  }

  function payRequest(fixture: OrgFixture, amount: number, branchId?: string) {
    return request(app.getHttpServer())
      .post('/api/v1/supplier-payment')
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .send({
        branchId: branchId ?? fixture.branchId,
        supplierId: fixture.supplierId,
        method: 'CASH',
        amount,
        paidAt: new Date().toISOString(),
      });
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await createE2eApp(moduleFixture);

    orgA = await setupOrganization('supplier-payment-concurrency-a', 'SPC-A');
    orgB = await setupOrganization('supplier-payment-concurrency-b', 'SPC-B');
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('CASE 1 — overpayment race: balance=1000, concurrent 800+800 → exactly one succeeds, final paid=800, balance=200', async () => {
    await topUpBalance(orgA, 1000);
    await expect(getBalance(orgA)).resolves.toBe(1000);

    const [resA, resB] = await Promise.all([
      payRequest(orgA, 800),
      payRequest(orgA, 800),
    ]);

    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 422]);
    // Không bao giờ 1600 được trả — bất biến trung tâm của T052.01.
    expect(statuses).not.toEqual([201, 201]);

    await expect(getBalance(orgA)).resolves.toBe(200);

    // Xác nhận trạng thái DATABASE thật (không chỉ đếm response HTTP) — đúng 1 Payment 800 được ghi.
    const payments = await prisma.payment.findMany({
      where: {
        organizationId: orgA.organizationId,
        supplierId: orgA.supplierId,
        direction: 'OUT',
      },
    });
    const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    expect(total).toBe(800);
  }, 30_000);

  it('CASE 2 — both concurrent payments valid: balance=1000, concurrent 400+500 → both succeed, final balance=100', async () => {
    await topUpBalance(orgA, 1000);
    await expect(getBalance(orgA)).resolves.toBe(1000);

    const [resA, resB] = await Promise.all([
      payRequest(orgA, 400),
      payRequest(orgA, 500),
    ]);

    // Bất biến quan trọng: implementation KHÔNG được từ chối cả 2 chỉ vì đồng thời — chỉ tuần tự
    // hoá việc KIỂM TRA, không tuần tự hoá thành "chặn mọi request đồng thời".
    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);

    await expect(getBalance(orgA)).resolves.toBe(100);
  }, 30_000);

  it('CASE 3a — branchId thuộc tổ chức khác bị từ chối, không tiết lộ cross-tenant, không đổi state ở CẢ HAI tổ chức', async () => {
    const balanceABefore = await getBalance(orgA);
    const balanceBBefore = await getBalance(orgB);

    const res = await payRequest(orgA, 100, orgB.branchId);
    expect(res.status).toBe(404);
    // Cùng đúng lỗi non-disclosure như branchId không tồn tại — không có mã lỗi/message riêng
    // biệt tiết lộ "branchId này CÓ tồn tại nhưng thuộc tổ chức khác" (ErrorCode.BRANCH_NOT_FOUND
    // = 'BRANCH_001', xem common/errors/error-codes.ts).
    expect(res.body.code).toBe('BRANCH_001');

    await expect(getBalance(orgA)).resolves.toBe(balanceABefore);
    await expect(getBalance(orgB)).resolves.toBe(balanceBBefore);
  });

  it('CASE 3b — thanh toán hợp lệ đồng thời ở 2 tổ chức khác nhau không ảnh hưởng lẫn nhau', async () => {
    await topUpBalance(orgA, 1000);
    await topUpBalance(orgB, 1000);
    const balanceABefore = await getBalance(orgA);
    const balanceBBefore = await getBalance(orgB);

    const [resA, resB] = await Promise.all([
      payRequest(orgA, 300),
      payRequest(orgB, 700),
    ]);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    await expect(getBalance(orgA)).resolves.toBe(balanceABefore - 300);
    await expect(getBalance(orgB)).resolves.toBe(balanceBBefore - 700);
  }, 30_000);

  it('CASE 4 — high-contention: bất biến SUM(payment đã commit) <= debt luôn đúng qua nhiều lần lặp', async () => {
    const CONCURRENT_REQUESTS = 10;
    const AMOUNT_EACH = 500;
    const ITERATIONS = 3;

    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
      // Balance đủ cho ĐÚNG 8/10 request (4000 / 500 = 8) — buộc phải có request bị từ chối mỗi
      // vòng lặp, không phải kịch bản "tất cả đều đủ tiền nên không thật sự kiểm chứng gì".
      await topUpBalance(orgA, 4000);
      const balanceBefore = await getBalance(orgA);

      const responses = await Promise.all(
        Array.from({ length: CONCURRENT_REQUESTS }, () =>
          payRequest(orgA, AMOUNT_EACH),
        ),
      );

      const succeeded = responses.filter((r) => r.status === 201).length;
      const rejected = responses.filter((r) => r.status === 422).length;
      expect(succeeded + rejected).toBe(CONCURRENT_REQUESTS);

      // Bằng chứng TRẠNG THÁI DATABASE THẬT — không chỉ đếm response HTTP.
      const balanceAfter = await getBalance(orgA);
      const paidThisRound = balanceBefore - balanceAfter;
      expect(paidThisRound).toBe(succeeded * AMOUNT_EACH);
      expect(paidThisRound).toBeLessThanOrEqual(balanceBefore);
    }
  }, 60_000);
});
