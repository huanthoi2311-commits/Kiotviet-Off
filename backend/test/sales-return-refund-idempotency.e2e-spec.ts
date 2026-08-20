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
 * T053.06E — real-Postgres proof cho Idempotency + cap-race concurrency của
 * POST /sales-returns/:id/refunds (thiết kế tại T053.06E Discovery Report, Architect
 * Implementation Authorization §8-16). E1-E10 theo đúng yêu cầu §16, E7 là CRITICAL HARD GATE
 * (2 Idempotency-Key KHÁC nhau, tổng vượt hạn mức, đua thật qua Promise.all — chứng minh khóa
 * `SELECT ... FOR UPDATE` trên SalesReturn đóng race "different-key concurrency vượt cap" mà
 * riêng cơ chế Idempotency Key không tự đóng được).
 *
 * KHÔNG tự chạy được trong sandbox này (thiếu Docker/PostgreSQL) — cùng giới hạn với các
 * *.e2e-spec.ts khác trong repo (xem `supplier-payment-idempotency.e2e-spec.ts`, cấu trúc CASE
 * mirror trực tiếp file này, đổi Payment/balance → Refund/SalesReturn.totalAmount cap).
 * Chạy trong CI qua `npm run test:e2e`.
 */
describe('SalesReturn Refund Idempotency (e2e, integration — Postgres thật)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  interface OrgFixture {
    organizationId: string;
    branchId: string;
    warehouseId: string;
    productId: string;
    accessToken: string;
    unitPrice: number;
  }

  let orgA: OrgFixture;
  let orgB: OrgFixture;

  const PRODUCT_UNIT_PRICE = 10_000;

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
      where: { organizationId_code: { organizationId, code: 'sri_e2e_role' } },
      create: { organizationId, code: 'sri_e2e_role', name: 'SRI E2E Role' },
      update: {},
    });

    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { code: { startsWith: 'pos:' } },
          { code: { startsWith: 'sales_return:' } },
          { code: { startsWith: 'product:' } },
          { code: { startsWith: 'inventory:' } },
        ],
      },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
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
      permissions: permissions.map((p) => p.code),
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
        prices: [{ type: 'RETAIL', price: PRODUCT_UNIT_PRICE }],
      })
      .expect(201);

    // Tồn kho ban đầu đủ lớn để checkout nhiều lần trong các CASE khác nhau.
    const adjustmentRes = await request(app.getHttpServer())
      .post('/api/v1/inventory-adjustments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        warehouseId: warehouse.id,
        reason: 'FOUND',
        items: [{ productId: productRes.body.data.id, quantity: 1000 }],
      })
      .expect(201);
    const adjustmentId = adjustmentRes.body.data.id;
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
      .send({ version: 1 })
      .expect(200);

    return {
      organizationId,
      branchId: branch.id,
      warehouseId: warehouse.id,
      productId: productRes.body.data.id,
      accessToken,
      unitPrice: PRODUCT_UNIT_PRICE,
    };
  }

  /**
   * Checkout `quantity` sản phẩm rồi tạo + submit + approve + receive 1 SalesReturn trả lại TOÀN
   * BỘ số lượng đó — trả về salesReturnId đã ở RECEIVED với totalAmount = quantity * unitPrice
   * CHÍNH XÁC (trả đủ 100% dòng gốc → `lineReturnValue === invoiceItemTotal`, không lệch làm
   * tròn — xem `SalesReturnService.buildItemInputs()`).
   */
  async function createReceivedSalesReturn(
    fixture: OrgFixture,
    quantity: number,
  ): Promise<{ salesReturnId: string; totalAmount: number }> {
    await request(app.getHttpServer())
      .post('/api/v1/cart/add')
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .send({ productId: fixture.productId, quantity })
      .expect(201);

    const checkoutRes = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .set('Idempotency-Key', `sri-e2e-checkout-${randomUUID()}`)
      .send({
        branchId: fixture.branchId,
        warehouseId: fixture.warehouseId,
        paymentMethod: 'CASH',
      })
      .expect(201);

    const invoiceId = checkoutRes.body.data.invoice.id as string;
    const invoiceItemId = checkoutRes.body.data.invoice.items[0].id as string;

    const created = await request(app.getHttpServer())
      .post('/api/v1/sales-returns')
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .send({
        invoiceId,
        items: [
          {
            invoiceItemId,
            quantity,
            reason: 'DAMAGED',
            warehouseId: fixture.warehouseId,
          },
        ],
      })
      .expect(201);
    const salesReturnId = created.body.data.id as string;
    const totalAmount = Number(created.body.data.totalAmount);

    // submit/approve/receive là @Post() không có @HttpCode() tường minh — mặc định NestJS trả 201
    // (Swagger doc của controller ghi 200 nhưng đó là tài liệu SAI CÓ SẴN, không thuộc phạm vi
    // T053.06E — test này khớp theo hành vi HTTP THẬT, không theo doc).
    await request(app.getHttpServer())
      .post(`/api/v1/sales-returns/${salesReturnId}/submit`)
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .send({ version: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/sales-returns/${salesReturnId}/approve`)
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .send({ version: 2 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/sales-returns/${salesReturnId}/receive`)
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .send({ version: 3 })
      .expect(201);

    return { salesReturnId, totalAmount };
  }

  function refundRequest(
    fixture: OrgFixture,
    salesReturnId: string,
    amount: number,
    idempotencyKey: string | undefined,
  ) {
    const req = request(app.getHttpServer())
      .post(`/api/v1/sales-returns/${salesReturnId}/refunds`)
      .set('Authorization', `Bearer ${fixture.accessToken}`);
    if (idempotencyKey !== undefined) {
      req.set('Idempotency-Key', idempotencyKey);
    }
    return req.send({ amount, method: 'CASH' });
  }

  async function countRefunds(salesReturnId: string): Promise<number> {
    return prisma.salesReturnRefund.count({ where: { salesReturnId } });
  }

  async function getOperation(fixture: OrgFixture, idempotencyKey: string) {
    return prisma.salesReturnRefundOperation.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: fixture.organizationId,
          idempotencyKey,
        },
      },
    });
  }

  async function activeRefundSum(salesReturnId: string): Promise<number> {
    const refunds = await prisma.salesReturnRefund.findMany({
      where: {
        salesReturnId,
        status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] },
      },
    });
    return refunds.reduce((sum, r) => sum + Number(r.amount), 0);
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await createE2eApp(moduleFixture);

    orgA = await setupOrganization(
      'sales-return-refund-idempotency-a',
      'SRI-A',
    );
    orgB = await setupOrganization(
      'sales-return-refund-idempotency-b',
      'SRI-B',
    );
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('E1 — key mới, happy path: 201, đúng 1 Refund, operation COMPLETED với đúng refundId', async () => {
    const { salesReturnId } = await createReceivedSalesReturn(orgA, 10);
    const key = randomUUID();

    const res = await refundRequest(orgA, salesReturnId, 40_000, key);

    expect(res.status).toBe(201);
    const refundId = res.body.data.id as string;

    const operation = await getOperation(orgA, key);
    expect(operation?.status).toBe('COMPLETED');
    expect(operation?.refundId).toBe(refundId);
    expect(await countRefunds(salesReturnId)).toBe(1);
  });

  it('E2 — replay chính xác sau thành công: cùng Refund.id, không tạo Refund thứ 2', async () => {
    const { salesReturnId } = await createReceivedSalesReturn(orgA, 10);
    const key = randomUUID();

    const first = await refundRequest(orgA, salesReturnId, 30_000, key);
    expect(first.status).toBe(201);
    const firstRefundId = first.body.data.id as string;

    const before = await countRefunds(salesReturnId);
    const replay = await refundRequest(orgA, salesReturnId, 30_000, key);

    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(firstRefundId);
    expect(await countRefunds(salesReturnId)).toBe(before);
  });

  it('E3 — concurrent duplicate thật sự (cùng key, cùng payload): không bao giờ 2 Refund row', async () => {
    const { salesReturnId } = await createReceivedSalesReturn(orgA, 10);
    const key = randomUUID();

    const [resA, resB] = await Promise.all([
      refundRequest(orgA, salesReturnId, 20_000, key),
      refundRequest(orgA, salesReturnId, 20_000, key),
    ]);

    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses[0]).toBe(201);
    expect([201, 409]).toContain(statuses[1]);

    const refundIds = new Set(
      [resA, resB]
        .filter((r) => r.status === 201)
        .map((r) => r.body.data.id as string),
    );
    expect(refundIds.size).toBe(1);
    expect(await countRefunds(salesReturnId)).toBe(1);
  }, 30_000);

  it('E4 — cùng key + payload khác: 409 key-reused, operation/Refund gốc không đổi', async () => {
    const { salesReturnId } = await createReceivedSalesReturn(orgA, 10);
    const key = randomUUID();

    const first = await refundRequest(orgA, salesReturnId, 15_000, key);
    expect(first.status).toBe(201);
    const operationBefore = await getOperation(orgA, key);
    const countBefore = await countRefunds(salesReturnId);

    const conflicting = await refundRequest(orgA, salesReturnId, 15_001, key);

    expect(conflicting.status).toBe(409);
    expect(conflicting.body.code).toBe('SALES_RETURN_016');

    const operationAfter = await getOperation(orgA, key);
    expect(operationAfter?.refundId).toBe(operationBefore?.refundId);
    expect(operationAfter?.requestFingerprint).toBe(
      operationBefore?.requestFingerprint,
    );
    expect(await countRefunds(salesReturnId)).toBe(countBefore);
  });

  it('E5 — vượt hạn mức (business failure): 422, operation FAILED, không Refund mồ côi (atomicity)', async () => {
    const { salesReturnId, totalAmount } = await createReceivedSalesReturn(
      orgA,
      10,
    );
    const key = randomUUID();
    const countBefore = await countRefunds(salesReturnId);

    const res = await refundRequest(orgA, salesReturnId, totalAmount + 1, key);

    expect(res.status).toBe(422);
    expect(await countRefunds(salesReturnId)).toBe(countBefore);

    const operation = await getOperation(orgA, key);
    expect(operation?.status).toBe('FAILED');
    expect(operation?.refundId).toBeNull();
  });

  it('E6 — retry SAU lỗi nghiệp vụ bằng ĐÚNG key + ĐÚNG payload, sau khi hạn mức được nới (hủy 1 Refund active khác) → thành công', async () => {
    const { salesReturnId, totalAmount } = await createReceivedSalesReturn(
      orgA,
      10,
    );

    // Chiếm gần hết hạn mức bằng 1 Refund khác trước.
    const blockerRes = await refundRequest(
      orgA,
      salesReturnId,
      totalAmount - 1_000,
      randomUUID(),
    );
    expect(blockerRes.status).toBe(201);
    const blockerRefundId = blockerRes.body.data.id as string;

    const key = randomUUID();
    const failed = await refundRequest(orgA, salesReturnId, 5_000, key); // vượt hạn mức còn lại (1_000)
    expect(failed.status).toBe(422);
    const operationAfterFail = await getOperation(orgA, key);
    expect(operationAfterFail?.status).toBe('FAILED');

    // Nới hạn mức từ BÊN NGOÀI — hủy Refund PENDING đang chặn (KHÔNG đổi payload dưới cùng key,
    // mirror D5/T052.05B CASE 5: chỉ được đổi TRẠNG THÁI HỆ THỐNG bên ngoài, không đổi request).
    await request(app.getHttpServer())
      .post(`/api/v1/sales-returns/refunds/${blockerRefundId}/cancel`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ version: 1 })
      .expect(201);

    const retry = await refundRequest(orgA, salesReturnId, 5_000, key); // ĐÚNG key, ĐÚNG payload
    expect(retry.status).toBe(201);

    const operationAfterRetry = await getOperation(orgA, key);
    expect(operationAfterRetry?.status).toBe('COMPLETED');
    expect(operationAfterRetry?.refundId).toBe(retry.body.data.id);
    expect(operationAfterRetry?.requestFingerprint).toBe(
      operationAfterFail?.requestFingerprint,
    );
  }, 30_000);

  // CRITICAL HARD GATE (T053.06E Discovery §14, Implementation Authorization §16) — 2
  // Idempotency-Key KHÁC nhau, tổng amount VƯỢT hạn mức, đua thật qua Promise.all thật sự song
  // song. Idempotency Key KHÔNG tự đóng được race này (2 key khác nhau → 2 operation độc lập) —
  // CHỈ khóa `SELECT ... FOR UPDATE` trên SalesReturn mới đóng được. Đây là bằng chứng THỰC
  // NGHIỆM trực tiếp cho khóa (không chỉ suy luận tĩnh từ source).
  it('E7 — [CRITICAL] 2 Idempotency-Key KHÁC nhau, tổng vượt hạn mức, đua thật: đúng 1 thành công, SUM(active refunds) <= totalAmount trong Postgres thật', async () => {
    const { salesReturnId, totalAmount } = await createReceivedSalesReturn(
      orgA,
      10,
    );
    const amountEach = Math.floor(totalAmount * 0.6); // 2 x 60% = 120% > 100% hạn mức
    const keyOne = randomUUID();
    const keyTwo = randomUUID();

    const [resOne, resTwo] = await Promise.all([
      refundRequest(orgA, salesReturnId, amountEach, keyOne),
      refundRequest(orgA, salesReturnId, amountEach, keyTwo),
    ]);

    const statuses = [resOne.status, resTwo.status].sort((a, b) => a - b);
    // Đúng 1 thành công (201); request còn lại PHẢI thất bại nghiệp vụ (422 — vượt hạn mức khi
    // đọc lại DƯỚI khóa) — không bao giờ cả 2 cùng thành công (sẽ vượt totalAmount).
    expect(statuses).toEqual([201, 422]);

    const sum = await activeRefundSum(salesReturnId);
    expect(sum).toBeLessThanOrEqual(totalAmount);
    expect(sum).toBe(amountEach); // đúng 1 refund được ghi nhận

    // Operation của request thua PHẢI dừng ở FAILED (không COMPLETED sai, không refund mồ côi).
    const opOne = await getOperation(orgA, keyOne);
    const opTwo = await getOperation(orgA, keyTwo);
    const [failedOp, completedOp] =
      opOne?.status === 'FAILED' ? [opOne, opTwo] : [opTwo, opOne];
    expect(failedOp?.status).toBe('FAILED');
    expect(failedOp?.refundId).toBeNull();
    expect(completedOp?.status).toBe('COMPLETED');
  }, 30_000);

  it('E8 — 2 Idempotency-Key KHÁC nhau, tổng TRONG hạn mức (không đua vượt cap): cả 2 Refund hợp lệ độc lập', async () => {
    const { salesReturnId, totalAmount } = await createReceivedSalesReturn(
      orgA,
      10,
    );
    const amountEach = Math.floor(totalAmount * 0.4); // 2 x 40% = 80% <= 100%
    const keyOne = randomUUID();
    const keyTwo = randomUUID();

    const [resOne, resTwo] = await Promise.all([
      refundRequest(orgA, salesReturnId, amountEach, keyOne),
      refundRequest(orgA, salesReturnId, amountEach, keyTwo),
    ]);

    expect(resOne.status).toBe(201);
    expect(resTwo.status).toBe(201);
    expect(resOne.body.data.id).not.toBe(resTwo.body.data.id);
    expect(await activeRefundSum(salesReturnId)).toBe(amountEach * 2);
  }, 30_000);

  it('E9 — stale PROCESSING + cùng fingerprint: reclaim thành công, chạy lại business logic', async () => {
    const { salesReturnId } = await createReceivedSalesReturn(orgA, 10);
    const key = randomUUID();

    const first = await refundRequest(orgA, salesReturnId, 10_000, key);
    expect(first.status).toBe(201);
    const firstRefundId = first.body.data.id as string;

    // Mô phỏng "bị treo giữa chừng" (crash sau reserve(), trước khi hoàn tất) — GIỮ NGUYÊN
    // requestFingerprint (bất biến), chỉ đổi status/createdAt/refundId/completedAt.
    await prisma.salesReturnRefundOperation.updateMany({
      where: { organizationId: orgA.organizationId, idempotencyKey: key },
      data: {
        status: 'PROCESSING',
        createdAt: new Date(Date.now() - 3 * 60 * 1000),
        refundId: null,
        completedAt: null,
      },
    });

    const reclaimed = await refundRequest(orgA, salesReturnId, 10_000, key);

    expect(reclaimed.status).toBe(201);
    const reclaimedRefundId = reclaimed.body.data.id as string;
    expect(reclaimedRefundId).not.toBe(firstRefundId);

    const operation = await getOperation(orgA, key);
    expect(operation?.status).toBe('COMPLETED');
    expect(operation?.refundId).toBe(reclaimedRefundId);
  }, 30_000);

  it('E10 — cùng giá trị key literal ở 2 tổ chức khác nhau: hoàn toàn độc lập, không rò rỉ/collide/replay chéo tổ chức', async () => {
    const returnA = await createReceivedSalesReturn(orgA, 10);
    const returnB = await createReceivedSalesReturn(orgB, 10);
    const sharedKeyLiteral = randomUUID();

    const resA = await refundRequest(
      orgA,
      returnA.salesReturnId,
      12_000,
      sharedKeyLiteral,
    );
    const resB = await refundRequest(
      orgB,
      returnB.salesReturnId,
      18_000,
      sharedKeyLiteral,
    );

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(resA.body.data.id).not.toBe(resB.body.data.id);

    const opA = await getOperation(orgA, sharedKeyLiteral);
    const opB = await getOperation(orgB, sharedKeyLiteral);
    expect(opA?.refundId).toBe(resA.body.data.id);
    expect(opB?.refundId).toBe(resB.body.data.id);
    expect(opA?.requestFingerprint).not.toBe(opB?.requestFingerprint);

    // Replay ở orgB bằng key này KHÔNG được trả về refund của orgA.
    const replayB = await refundRequest(
      orgB,
      returnB.salesReturnId,
      18_000,
      sharedKeyLiteral,
    );
    expect(replayB.status).toBe(201);
    expect(replayB.body.data.id).toBe(resB.body.data.id);
    expect(replayB.body.data.id).not.toBe(resA.body.data.id);
  }, 30_000);

  // Extra — validate header (Security/Correctness Gate, không thuộc E1-E10 numbered matrix).
  it('Extra — thiếu header Idempotency-Key: 400, không tạo Refund', async () => {
    const { salesReturnId } = await createReceivedSalesReturn(orgA, 10);
    const countBefore = await countRefunds(salesReturnId);

    const res = await refundRequest(orgA, salesReturnId, 10_000, undefined);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SALES_RETURN_015');
    expect(await countRefunds(salesReturnId)).toBe(countBefore);
  });
});
