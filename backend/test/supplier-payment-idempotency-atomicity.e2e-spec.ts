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
import { PrismaService } from '../src/prisma/prisma.service';
import { PERMISSION_CATALOG } from '../src/modules/rbac/infrastructure/permission-catalog';
import { SUPPLIER_PAYMENT_OPERATION_REPOSITORY } from '../src/modules/supplier-debt/domain/repositories/supplier-payment-operation.repository.interface';
import type { ISupplierPaymentOperationRepository } from '../src/modules/supplier-debt/domain/repositories/supplier-payment-operation.repository.interface';
import { PrismaSupplierPaymentOperationRepository } from '../src/modules/supplier-debt/infrastructure/persistence/prisma-supplier-payment-operation.repository';

/**
 * T052.05B.1 — closes the CASE 11 gap flagged by Architect Review: real-Postgres proof that a
 * failure occurring AFTER the real `tx.payment.create()` INSERT but BEFORE the business
 * transaction commits rolls back completely (Payment row gone, operation never COMPLETED).
 *
 * No public HTTP input can trigger this window (`markCompleted()` is a PK-keyed UPDATE against a
 * row that provably exists in the same transaction — see T052.05B's original report §20) and no
 * production fault-injection hook is added (forbidden by the review). Instead this file overrides
 * `SUPPLIER_PAYMENT_OPERATION_REPOSITORY` at the NestJS TESTING MODULE level (Architect Review's
 * preferred "approach A"): every method delegates to a REAL `PrismaSupplierPaymentOperationRepository`
 * instance running against real Postgres, EXCEPT `markCompleted()`, whose FIRST call is a one-time
 * rejected mock (`mockRejectedValueOnce`) — every call after that reverts to the real
 * implementation. This is a test-only DI substitution; zero production source file is modified,
 * and the request that gets the injected failure still runs through `SupplierDebtService`'s and
 * `PrismaSupplierDebtRepository`'s REAL, unmodified code — including the REAL
 * `tx.payment.create()` INSERT and the REAL advisory lock — right up until the mocked
 * `markCompleted()` throws inside the same open `$transaction` callback, which is exactly the
 * post-INSERT/pre-commit window the review asked to exercise.
 *
 * KHÔNG tự chạy được trong sandbox này (thiếu Docker/PostgreSQL) — chạy trong CI qua
 * `npm run test:e2e`, cùng giới hạn với mọi `*.e2e-spec.ts` khác trong repo.
 */
describe('SupplierPayment Idempotency Atomicity (e2e, integration — Postgres thật, T052.05B.1)', () => {
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

  let org: OrgFixture;

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
      where: { organizationId_code: { organizationId, code: 'spia_e2e_role' } },
      create: { organizationId, code: 'spia_e2e_role', name: 'SPIA E2E Role' },
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

  function payRequest(
    fixture: OrgFixture,
    amount: number,
    idempotencyKey: string,
    paidAt: string,
  ) {
    return request(app.getHttpServer())
      .post('/api/v1/supplier-payment')
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        branchId: fixture.branchId,
        supplierId: fixture.supplierId,
        method: 'CASH',
        amount,
        paidAt,
      });
  }

  async function countPaymentsByAmount(
    fixture: OrgFixture,
    amount: number,
  ): Promise<number> {
    return prisma.payment.count({
      where: {
        organizationId: fixture.organizationId,
        supplierId: fixture.supplierId,
        direction: 'OUT',
        amount,
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
    })
      .overrideProvider(SUPPLIER_PAYMENT_OPERATION_REPOSITORY)
      .useFactory({
        factory: (
          prismaService: PrismaService,
        ): ISupplierPaymentOperationRepository => {
          // Bọc quanh implementation THẬT — mọi thao tác (kể cả markCompleted() từ lần gọi thứ 2
          // trở đi) chạy đúng code sản xuất, chạm Postgres thật. CHỈ lần gọi ĐẦU TIÊN của
          // markCompleted() bị thay bằng 1 lần reject duy nhất (mockRejectedValueOnce) — mô phỏng
          // "crash ngay sau INSERT thật, trước khi transaction commit" mà không có bất kỳ hook nào
          // trong production code.
          const real = new PrismaSupplierPaymentOperationRepository(
            prismaService,
          );
          const markCompleted = jest.fn();
          markCompleted.mockRejectedValueOnce(
            new Error(
              'T052.05B.1 — injected post-INSERT/pre-commit failure (test-only DI override, no production hook)',
            ),
          );
          markCompleted.mockImplementation(
            (
              ...args: Parameters<
                ISupplierPaymentOperationRepository['markCompleted']
              >
            ) => real.markCompleted(...args),
          );
          return {
            findByKey: (...args) => real.findByKey(...args),
            create: (...args) => real.create(...args),
            tryReclaim: (...args) => real.tryReclaim(...args),
            markFailed: (...args) => real.markFailed(...args),
            markCompleted: markCompleted,
          };
        },
        inject: [PrismaService],
      })
      .compile();

    app = await createE2eApp(moduleFixture);

    org = await setupOrganization(
      'supplier-payment-idempotency-atomicity',
      'SPIA',
    );
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('T052.05B.1 — post-INSERT/pre-commit failure rolls back the Payment INSERT; retry with the same key reclaims and commits exactly once', async () => {
    await topUpBalance(org, 100_000);
    const key = randomUUID();
    const paidAt = new Date().toISOString();
    const amount = 8_123; // giá trị riêng biệt để phân biệt Payment của test này với các dòng khác

    const balanceBefore = await getBalance(org);
    const paymentCountBefore = await countPaymentsByAmount(org, amount);

    // ── Lần 1: markCompleted() (mocked) throw NGAY SAU khi tx.payment.create() THẬT đã INSERT.
    const first = await payRequest(org, amount, key, paidAt);

    // markCompleted() throw bên trong $transaction callback → Nest không bắt được lỗi nghiệp vụ
    // đã biết nào (không phải SupplierPaymentExceedsBalanceError) → propagate như Error thường →
    // HttpExceptionFilter ánh xạ thành 500 (đúng hành vi đã có từ trước, không phải case mới).
    expect(first.status).toBe(500);

    // 1. Payment row does NOT exist after rollback.
    expect(await countPaymentsByAmount(org, amount)).toBe(paymentCountBefore);

    // 4. No partial financial side effect from that transaction remains.
    expect(await getBalance(org)).toBe(balanceBefore);

    // 2 + 3. SupplierPaymentOperation is NOT COMPLETED; paymentId is NOT persisted.
    const operationAfterFailure = await getOperation(org, key);
    expect(operationAfterFailure).not.toBeNull();
    expect(operationAfterFailure?.status).not.toBe('COMPLETED');
    expect(operationAfterFailure?.paymentId).toBeNull();

    // 5. Operation follows the approved failure semantics — the request that owned NEW
    // (reserve() succeeded before the injected failure) is the one that marks FAILED, exactly
    // the same path as any other post-reservation business error (D9).
    expect(operationAfterFailure?.status).toBe('FAILED');

    // ── Lần 2 (retry): CÙNG key, CÙNG payload (cùng fingerprint) — markCompleted() lần này chạy
    // implementation THẬT (mock chỉ reject đúng 1 lần) → phải thành công bình thường.
    const retry = await payRequest(org, amount, key, paidAt);

    // 6. A subsequent retry with same key + same fingerprint can reclaim and successfully create
    // exactly ONE Payment.
    expect(retry.status).toBe(201);
    const retryPaymentId = retry.body.data.id as string;

    // 7. operation.status = COMPLETED, operation.paymentId = resulting Payment.id.
    const operationAfterRetry = await getOperation(org, key);
    expect(operationAfterRetry?.status).toBe('COMPLETED');
    expect(operationAfterRetry?.paymentId).toBe(retryPaymentId);
    // Fingerprint bất biến xuyên suốt toàn bộ vòng đời, kể cả sau rollback+FAILED+reclaim.
    expect(operationAfterRetry?.requestFingerprint).toBe(
      operationAfterFailure?.requestFingerprint,
    );

    // 8. Exactly ONE committed Payment for that logical intent — chứng minh lần INSERT đầu tiên
    // (đã rollback) không để lại bất kỳ dòng mồ côi nào; chỉ dòng của lần retry tồn tại.
    expect(await countPaymentsByAmount(org, amount)).toBe(
      paymentCountBefore + 1,
    );
    const payment = await prisma.payment.findUnique({
      where: { id: retryPaymentId },
    });
    expect(payment).not.toBeNull();
    expect(await getBalance(org)).toBe(balanceBefore - amount);
  }, 30_000);
});
