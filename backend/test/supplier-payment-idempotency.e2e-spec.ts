import { randomUUID } from 'crypto';
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
 * T052.05B — real-Postgres proof cho Idempotency của POST /supplier-payment (thiết kế tại
 * T052.05A/T052.05A.1, quyết định tại T052.05A.1/Architect Decision D1-D13). CASE 1-11 theo đúng
 * yêu cầu của authorization T052.05B §9.
 *
 * KHÔNG tự chạy được trong sandbox này (thiếu Docker/PostgreSQL, không có quyền khởi động
 * Windows Service `postgresql-x64-17` cục bộ) — cùng giới hạn với các *.e2e-spec.ts khác trong
 * repo (xem `supplier-payment-concurrency.e2e-spec.ts`). Chạy trong CI qua `npm run test:e2e`.
 *
 * CASE 11 (atomicity — force failure giữa Payment.create() và markCompleted()): KHÔNG thể trigger
 * qua public API (không có input hợp lệ nào khiến markCompleted() tự thất bại — nó chỉ UPDATE 1
 * row bằng PK vừa tồn tại chắc chắn trong CÙNG transaction) và KHÔNG dùng test-only hook trong
 * production code (bị cấm rõ ràng bởi §15 của authorization). Bằng chứng atomicity ở đây là bằng
 * chứng TĨNH (cùng `tx` handle, xem `prisma-supplier-debt.repository.ts` + unit test tương ứng
 * trong `prisma-supplier-debt.repository.spec.ts`) kết hợp bằng chứng THỰC NGHIỆM cho nhánh THẤT
 * BẠI-TRƯỚC-Payment.create() (CASE 11 dưới đây — nhánh duy nhất thực sự reachable qua input hợp
 * lệ) — không có kịch bản nào qua transaction thật tạo ra Payment mà operation không COMPLETED,
 * hoặc operation COMPLETED mà không có Payment tương ứng.
 */
describe('SupplierPayment Idempotency (e2e, integration — Postgres thật)', () => {
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
    await prisma.organizationSubscription.upsert({
      where: { organizationId },
      create: { organizationId },
      update: {},
    });

    for (const permission of PERMISSION_CATALOG) {
      await prisma.permission.upsert({
        where: { code: permission.code },
        create: permission,
        update: {},
      });
    }

    const role = await prisma.role.upsert({
      where: { organizationId_code: { organizationId, code: 'spi_e2e_role' } },
      create: { organizationId, code: 'spi_e2e_role', name: 'SPI E2E Role' },
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

  async function topUpBalance(
    fixture: OrgFixture,
    target: number,
  ): Promise<void> {
    const current = await getBalance(fixture);
    const shortfall = target - current;
    if (shortfall <= 0) return;
    await receivePurchaseOrder(fixture, shortfall, 1);
  }

  // T052.05A.1 §7/§8 — requestFingerprint băm TOÀN BỘ DTO, bao gồm `paidAt` (field nghiệp vụ do
  // client cung cấp, không phải timestamp hệ thống). Vì vậy 1 "replay" thật sự PHẢI gửi lại
  // NGUYÊN VĂN cùng `paidAt` — không được để mỗi lời gọi tự sinh `new Date().toISOString()` mới
  // (sẽ vô tình tạo ra payload KHÁC nhau → đúng-nhưng-không-mong-muốn 409 key-reused). Caller nào
  // cần 2 lời gọi được coi là "cùng 1 request" (CASE 2/3/5/6/10) PHẢI tự chốt 1 `paidAt` và
  // truyền lại y hệt; các CASE cố ý gửi payload khác (4/8/9) vẫn nên giữ `paidAt` cố định để
  // khác biệt DUY NHẤT nằm ở field đang được kiểm chứng (amount), không lẫn với `paidAt` trôi.
  function payRequest(
    fixture: OrgFixture,
    amount: number,
    idempotencyKey: string | undefined,
    paidAt: string = new Date().toISOString(),
  ) {
    const req = request(app.getHttpServer())
      .post('/api/v1/supplier-payment')
      .set('Authorization', `Bearer ${fixture.accessToken}`);
    if (idempotencyKey !== undefined) {
      req.set('Idempotency-Key', idempotencyKey);
    }
    return req.send({
      branchId: fixture.branchId,
      supplierId: fixture.supplierId,
      method: 'CASH',
      amount,
      paidAt,
    });
  }

  async function countPayments(fixture: OrgFixture): Promise<number> {
    return prisma.payment.count({
      where: {
        organizationId: fixture.organizationId,
        supplierId: fixture.supplierId,
        direction: 'OUT',
      },
    });
  }

  async function getOperation(fixture: OrgFixture, idempotencyKey: string) {
    return prisma.supplierPaymentOperation.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: fixture.organizationId,
          idempotencyKey,
        },
      },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await createE2eApp(moduleFixture);

    orgA = await setupOrganization('supplier-payment-idempotency-a', 'SPI-A');
    orgB = await setupOrganization('supplier-payment-idempotency-b', 'SPI-B');
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('CASE 1 — key mới, happy path: 201, đúng 1 Payment, operation COMPLETED với đúng paymentId', async () => {
    await topUpBalance(orgA, 100_000);
    const key = randomUUID();

    const res = await payRequest(orgA, 10_000, key);

    expect(res.status).toBe(201);
    const paymentId = res.body.data.id as string;

    const operation = await getOperation(orgA, key);
    expect(operation?.status).toBe('COMPLETED');
    expect(operation?.paymentId).toBe(paymentId);

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });
    expect(payment).not.toBeNull();
  });

  it('CASE 2 — replay chính xác sau thành công: cùng Payment.id, đúng 1 Payment row, không audit/log lần 2', async () => {
    await topUpBalance(orgA, 100_000);
    const key = randomUUID();
    const paidAt = new Date().toISOString(); // cố định — replay PHẢI gửi lại nguyên văn payload

    const first = await payRequest(orgA, 5_000, key, paidAt);
    expect(first.status).toBe(201);
    const firstPaymentId = first.body.data.id as string;

    const before = await countPayments(orgA);
    const replay = await payRequest(orgA, 5_000, key, paidAt);

    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(firstPaymentId);
    const after = await countPayments(orgA);
    expect(after).toBe(before); // không tạo Payment mới
  });

  it('CASE 3 — concurrent duplicate thật sự (cùng key, cùng payload): không bao giờ 2 Payment row', async () => {
    await topUpBalance(orgA, 100_000);
    const key = randomUUID();
    const paidAt = new Date().toISOString(); // cố định — 2 request PHẢI thật sự cùng payload

    const [resA, resB] = await Promise.all([
      payRequest(orgA, 7_000, key, paidAt),
      payRequest(orgA, 7_000, key, paidAt),
    ]);

    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    // Đúng 1 request tạo mới (201); request còn lại HOẶC replay đúng payment đó (201, cùng id)
    // HOẶC thua race về "đang xử lý" (409) — không bao giờ CẢ HAI tạo Payment riêng biệt.
    expect(statuses[0]).toBe(201);
    expect([201, 409]).toContain(statuses[1]);

    const paymentIds = new Set(
      [resA, resB]
        .filter((r) => r.status === 201)
        .map((r) => r.body.data.id as string),
    );
    expect(paymentIds.size).toBe(1); // không bao giờ 2 payment id khác nhau

    const operation = await getOperation(orgA, key);
    expect(operation?.status).toBe('COMPLETED');
  }, 30_000);

  it('CASE 4 — cùng key + payload khác: 409 key-reused, operation/Payment gốc không đổi', async () => {
    await topUpBalance(orgA, 100_000);
    const key = randomUUID();
    const paidAt = new Date().toISOString(); // cố định — khác biệt DUY NHẤT là amount

    const first = await payRequest(orgA, 3_000, key, paidAt);
    expect(first.status).toBe(201);
    const operationBefore = await getOperation(orgA, key);
    const paymentCountBefore = await countPayments(orgA);

    const conflicting = await payRequest(orgA, 3_001, key, paidAt); // payload khác — chỉ đổi amount

    expect(conflicting.status).toBe(409);
    expect(conflicting.body.code).toBe('SUPPLIER_DEBT_004');

    const operationAfter = await getOperation(orgA, key);
    expect(operationAfter?.paymentId).toBe(operationBefore?.paymentId);
    expect(operationAfter?.requestFingerprint).toBe(
      operationBefore?.requestFingerprint,
    );
    expect(await countPayments(orgA)).toBe(paymentCountBefore); // không tạo Payment mới
  });

  it('CASE 5 — retry SAU lỗi nghiệp vụ (balance không đủ) bằng ĐÚNG key + ĐÚNG payload, sau khi balance được bổ sung từ bên ngoài → thành công', async () => {
    const balance = await getBalance(orgA);
    const amount = balance + 50_000; // chắc chắn vượt quá balance hiện tại
    const key = randomUUID();
    const paidAt = new Date().toISOString(); // cố định — D5 cấm đổi payload dưới cùng 1 key

    const failed = await payRequest(orgA, amount, key, paidAt);
    expect(failed.status).toBe(422);

    const operationAfterFail = await getOperation(orgA, key);
    expect(operationAfterFail?.status).toBe('FAILED');
    expect(operationAfterFail?.paymentId).toBeNull();

    // Bổ sung công nợ từ BÊN NGOÀI (Purchase Order mới) — KHÔNG đổi payload thanh toán, đúng
    // yêu cầu D5 ("Do NOT change amount/payload under the same key for CASE 5").
    await topUpBalance(orgA, amount + 10_000);

    const retry = await payRequest(orgA, amount, key, paidAt); // ĐÚNG key, ĐÚNG payload
    expect(retry.status).toBe(201);

    const operationAfterRetry = await getOperation(orgA, key);
    expect(operationAfterRetry?.status).toBe('COMPLETED');
    expect(operationAfterRetry?.paymentId).toBe(retry.body.data.id);
    // Fingerprint bất biến xuyên suốt toàn bộ vòng đời — không hề bị ghi đè.
    expect(operationAfterRetry?.requestFingerprint).toBe(
      operationAfterFail?.requestFingerprint,
    );
  }, 30_000);

  it('CASE 6 — stale PROCESSING + cùng fingerprint: reclaim thành công, chạy lại business logic', async () => {
    await topUpBalance(orgA, 100_000);
    const key = randomUUID();
    const paidAt = new Date().toISOString(); // cố định — reclaim yêu cầu ĐÚNG fingerprint

    const first = await payRequest(orgA, 4_000, key, paidAt);
    expect(first.status).toBe(201);
    const firstPaymentId = first.body.data.id as string;

    // Mô phỏng "bị treo giữa chừng" (crash sau reserve(), trước khi hoàn tất) bằng cách đưa row
    // đã COMPLETED trở lại đúng hình dạng của 1 row PROCESSING thật sự bị treo quá 2 phút — GIỮ
    // NGUYÊN requestFingerprint (bất biến), chỉ đổi status/createdAt/paymentId/completedAt. Việc
    // reclaim-và-chạy-lại-business-logic sau đó diễn ra HOÀN TOÀN qua HTTP thật, không giả lập.
    await prisma.supplierPaymentOperation.updateMany({
      where: { organizationId: orgA.organizationId, idempotencyKey: key },
      data: {
        status: 'PROCESSING',
        createdAt: new Date(Date.now() - 3 * 60 * 1000),
        paymentId: null,
        completedAt: null,
      },
    });

    const reclaimed = await payRequest(orgA, 4_000, key, paidAt); // cùng key, cùng payload

    expect(reclaimed.status).toBe(201);
    const reclaimedPaymentId = reclaimed.body.data.id as string;
    expect(reclaimedPaymentId).not.toBe(firstPaymentId); // Payment MỚI được tạo qua business logic thật

    const operation = await getOperation(orgA, key);
    expect(operation?.status).toBe('COMPLETED');
    expect(operation?.paymentId).toBe(reclaimedPaymentId);
  }, 30_000);

  it('CASE 7 — key khác nhau + payload giống hệt nhau: 2 Payment hợp lệ độc lập', async () => {
    await topUpBalance(orgA, 100_000);
    const keyOne = randomUUID();
    const keyTwo = randomUUID();
    const paidAt = new Date().toISOString(); // cố định — "payload giống hệt nhau" đúng nghĩa

    const [resOne, resTwo] = await Promise.all([
      payRequest(orgA, 2_500, keyOne, paidAt),
      payRequest(orgA, 2_500, keyTwo, paidAt),
    ]);

    expect(resOne.status).toBe(201);
    expect(resTwo.status).toBe(201);
    expect(resOne.body.data.id).not.toBe(resTwo.body.data.id);
  }, 30_000);

  it('CASE 8 — FAILED + payload khác: 409 key-reused, fingerprint KHÔNG bị ghi đè', async () => {
    const balance = await getBalance(orgA);
    const amount = balance + 60_000;
    const key = randomUUID();
    const paidAt = new Date().toISOString(); // cố định — khác biệt DUY NHẤT là amount

    const failed = await payRequest(orgA, amount, key, paidAt);
    expect(failed.status).toBe(422);
    const operationBefore = await getOperation(orgA, key);
    expect(operationBefore?.status).toBe('FAILED');

    const differentPayload = await payRequest(orgA, amount + 1, key, paidAt);
    expect(differentPayload.status).toBe(409);
    expect(differentPayload.body.code).toBe('SUPPLIER_DEBT_004');

    const operationAfter = await getOperation(orgA, key);
    expect(operationAfter?.status).toBe('FAILED'); // KHÔNG chuyển sang PROCESSING
    expect(operationAfter?.requestFingerprint).toBe(
      operationBefore?.requestFingerprint,
    ); // KHÔNG bị ghi đè
  }, 30_000);

  it('CASE 9 — stale PROCESSING + payload khác: 409 key-reused, fingerprint KHÔNG bị ghi đè', async () => {
    await topUpBalance(orgA, 100_000);
    const key = randomUUID();
    const paidAt = new Date().toISOString(); // cố định — khác biệt DUY NHẤT là amount

    const first = await payRequest(orgA, 1_500, key, paidAt);
    expect(first.status).toBe(201);

    await prisma.supplierPaymentOperation.updateMany({
      where: { organizationId: orgA.organizationId, idempotencyKey: key },
      data: {
        status: 'PROCESSING',
        createdAt: new Date(Date.now() - 3 * 60 * 1000),
        paymentId: null,
        completedAt: null,
      },
    });
    const operationBefore = await getOperation(orgA, key);

    const differentPayload = await payRequest(orgA, 1_501, key, paidAt); // stale, nhưng payload khác
    expect(differentPayload.status).toBe(409);
    expect(differentPayload.body.code).toBe('SUPPLIER_DEBT_004');

    const operationAfter = await getOperation(orgA, key);
    expect(operationAfter?.status).toBe('PROCESSING'); // KHÔNG bị reclaim
    expect(operationAfter?.requestFingerprint).toBe(
      operationBefore?.requestFingerprint,
    );
    expect(operationAfter?.createdAt.getTime()).toBe(
      operationBefore?.createdAt.getTime(),
    ); // không bị reset
  }, 30_000);

  it('CASE 10 — cùng giá trị key literal ở 2 tổ chức khác nhau: hoàn toàn độc lập, không rò rỉ/collide/replay chéo tổ chức', async () => {
    await topUpBalance(orgA, 100_000);
    await topUpBalance(orgB, 100_000);
    const sharedKeyLiteral = randomUUID(); // CHỦ Ý dùng CÙNG 1 chuỗi key cho cả 2 org
    const paidAtB = new Date().toISOString(); // cố định — replayB PHẢI gửi lại nguyên văn payload

    const resA = await payRequest(orgA, 6_000, sharedKeyLiteral);
    const resB = await payRequest(orgB, 9_000, sharedKeyLiteral, paidAtB);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(resA.body.data.id).not.toBe(resB.body.data.id);

    const opA = await getOperation(orgA, sharedKeyLiteral);
    const opB = await getOperation(orgB, sharedKeyLiteral);
    expect(opA?.paymentId).toBe(resA.body.data.id);
    expect(opB?.paymentId).toBe(resB.body.data.id);
    expect(opA?.requestFingerprint).not.toBe(opB?.requestFingerprint); // payload khác nhau

    // Replay ở orgB bằng key này KHÔNG được trả về payment của orgA.
    const replayB = await payRequest(orgB, 9_000, sharedKeyLiteral, paidAtB);
    expect(replayB.status).toBe(201);
    expect(replayB.body.data.id).toBe(resB.body.data.id);
    expect(replayB.body.data.id).not.toBe(resA.body.data.id);
  }, 30_000);

  // CASE 11 (atomicity) — xem docstring đầu file: nhánh THẤT BẠI-TRƯỚC-Payment.create() là nhánh
  // DUY NHẤT reachable qua input hợp lệ (markCompleted() không có input hợp lệ nào khiến nó tự
  // thất bại — UPDATE 1 row bằng PK vừa insert chắc chắn trong CÙNG transaction). Test này chứng
  // minh: thất bại nghiệp vụ (balance không đủ) KHÔNG BAO GIỜ để lại Payment mồ côi hoặc operation
  // COMPLETED sai — rollback toàn bộ, operation dừng đúng ở FAILED.
  it('CASE 11 — atomicity (nhánh reachable): thất bại nghiệp vụ TRƯỚC Payment.create() → rollback hoàn toàn, không Payment mồ côi, operation dừng ở FAILED (không COMPLETED sai)', async () => {
    const balance = await getBalance(orgA);
    const amount = balance + 70_000;
    const key = randomUUID();
    const paymentCountBefore = await countPayments(orgA);

    const res = await payRequest(orgA, amount, key);

    expect(res.status).toBe(422);
    expect(await countPayments(orgA)).toBe(paymentCountBefore); // không Payment mồ côi

    const operation = await getOperation(orgA, key);
    expect(operation?.status).toBe('FAILED'); // không bao giờ COMPLETED mà thiếu Payment
    expect(operation?.paymentId).toBeNull();
  });
});
