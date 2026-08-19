import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './helpers/create-e2e-app';
import { AppModule } from '../src/app.module';
import { INVENTORY_REPOSITORY } from '../src/modules/inventory/domain/repositories/inventory.repository.interface';
import type { IInventoryRepository } from '../src/modules/inventory/domain/repositories/inventory.repository.interface';
import { PERMISSION_CATALOG } from '../src/modules/rbac/infrastructure/permission-catalog';

/**
 * T051.06A — Checkout Branch/Warehouse tenant-isolation fix. Trước fix này, `POST /checkout`
 * dùng `dto.branchId`/`dto.warehouseId` trực tiếp trong Business Transaction (CheckoutOperation/
 * Invoice/Payment/Inventory) mà KHÔNG xác minh 2 ID đó thuộc `actor.organizationId` — khác hẳn
 * `customerId`/`voucherCode`/`productId` cùng file, vốn đã được xác minh từ trước. Org A có thể
 * submit Branch/Warehouse UUID thật của Org B và tạo ra quan hệ khoá ngoại xuyên tổ chức.
 *
 * Suite này chứng minh fix từ NGOÀI process, qua Postgres/Redis thật — 2 tổ chức thật, 2 JWT
 * thật, HTTP thật — không phải unit-level mock. KHÔNG tự chạy được trong sandbox này (thiếu
 * Docker). npm run test:e2e -- checkout-tenant-isolation.e2e-spec.ts
 *
 * Kiến trúc reserve-first (SPEC-T013-SALES-FOUNDATION-001 §13.2) KHÔNG đổi (Architect Decision,
 * T051.06A ordering-conflict resolution, Option B): `CheckoutOperation.reserve()` vẫn là bước
 * ĐẦU TIÊN, kể cả cho 1 request tấn công cross-tenant — hệ quả CHẤP NHẬN ĐƯỢC là 1 dòng
 * CheckoutOperation ở trạng thái FAILED còn lại (bookkeeping row, không phải business record).
 * Điều KHÔNG được chấp nhận: CheckoutOperation COMPLETED, hoặc bất kỳ Invoice/Payment/Inventory/
 * InventoryMovement nào tham chiếu tới Branch/Warehouse của tổ chức khác.
 */
describe('Checkout Branch/Warehouse Tenant Isolation (e2e, T051.06A)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let inventoryRepository: IInventoryRepository;

  let orgAId: string;
  let orgBId: string;
  let branchAId: string;
  let warehouseAId: string;
  let branchBId: string;
  let warehouseBId: string;
  let productId: string;
  let orgAToken: string;
  let orgAUserId: string;

  async function seedProductForOrgA() {
    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({
        type: 'STANDARD',
        categoryId: await seedCategory(),
        unitId: await seedUnit(),
        name: `Sản phẩm tenant-iso e2e ${Date.now()}-${Math.random()}`,
        costPrice: 80000,
        vat: 10,
        prices: [{ type: 'RETAIL', price: 100000 }],
      })
      .expect(201);
    return productRes.body.data.id as string;
  }

  let categoryIdCache: string | undefined;
  async function seedCategory() {
    if (categoryIdCache) return categoryIdCache;
    const category = await prisma.category.upsert({
      where: {
        organizationId_code: { organizationId: orgAId, code: 'E2E-CAT-TI' },
      },
      create: {
        organizationId: orgAId,
        code: 'E2E-CAT-TI',
        name: 'Danh mục Tenant Isolation e2e',
        slug: 'danh-muc-tenant-iso-e2e',
      },
      update: {},
    });
    categoryIdCache = category.id;
    return categoryIdCache;
  }

  let unitIdCache: string | undefined;
  async function seedUnit() {
    if (unitIdCache) return unitIdCache;
    const unit = await prisma.unit.upsert({
      where: {
        organizationId_code: { organizationId: orgAId, code: 'E2E-UNIT-TI' },
      },
      create: {
        organizationId: orgAId,
        code: 'E2E-UNIT-TI',
        name: 'Cái',
        symbol: 'cái-ti',
      },
      update: {},
    });
    unitIdCache = unit.id;
    return unitIdCache;
  }

  async function addToCart(quantity = 1) {
    await request(app.getHttpServer())
      .post('/api/v1/cart/add')
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ productId, quantity })
      .expect(201);
  }

  async function assertNoCrossTenantContamination(): Promise<void> {
    // "Không có quan hệ bất khả thi" (§10) — không Invoice/Payment nào của Org A tham chiếu
    // Branch của Org B, không Inventory/InventoryMovement nào của Org A tham chiếu Warehouse
    // của Org B.
    const invoices = await prisma.invoice.findMany({
      where: { organizationId: orgAId, branchId: branchBId },
    });
    expect(invoices).toHaveLength(0);

    const payments = await prisma.payment.findMany({
      where: { organizationId: orgAId, branchId: branchBId },
    });
    expect(payments).toHaveLength(0);

    const inventoryRows = await prisma.inventory.findMany({
      where: { organizationId: orgAId, warehouseId: warehouseBId },
    });
    expect(inventoryRows).toHaveLength(0);

    const movements = await prisma.inventoryMovement.findMany({
      where: { organizationId: orgAId, warehouseId: warehouseBId },
    });
    expect(movements).toHaveLength(0);
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    for (const permission of PERMISSION_CATALOG) {
      await prisma.permission.upsert({
        where: { code: permission.code },
        create: permission,
        update: {},
      });
    }

    const orgA = await prisma.organization.upsert({
      where: { slug: 'checkout-tenant-iso-org-a' },
      create: {
        code: 'ORG-CO-TI-A',
        displayName: 'Checkout Tenant Iso Org A',
        slug: 'checkout-tenant-iso-org-a',
      },
      update: {},
    });
    orgAId = orgA.id;
    // T053.05B - to chuc test fixture nay tao truc tiep, khong tu dong co OrganizationSubscription.
    await prisma.organizationSubscription.upsert({
      where: { organizationId: orgAId },
      create: { organizationId: orgAId },
      update: {},
    });

    const orgB = await prisma.organization.upsert({
      where: { slug: 'checkout-tenant-iso-org-b' },
      create: {
        code: 'ORG-CO-TI-B',
        displayName: 'Checkout Tenant Iso Org B',
        slug: 'checkout-tenant-iso-org-b',
      },
      update: {},
    });
    orgBId = orgB.id;
    await prisma.organizationSubscription.upsert({
      where: { organizationId: orgBId },
      create: { organizationId: orgBId },
      update: {},
    });

    const role = await prisma.role.upsert({
      where: {
        organizationId_code: {
          organizationId: orgAId,
          code: 'checkout_tenant_iso_role',
        },
      },
      create: {
        organizationId: orgAId,
        code: 'checkout_tenant_iso_role',
        name: 'Checkout Tenant Iso Role',
      },
      update: {},
    });
    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { code: 'pos:access' },
          { code: { startsWith: 'product:' } },
          { code: { startsWith: 'customer:' } },
          { code: { startsWith: 'invoice:' } },
          { code: { startsWith: 'payment:' } },
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
          organizationId: orgAId,
          email: 'checkout-tenant-iso-a@pos-erp.local',
        },
      },
      create: {
        organizationId: orgAId,
        username: 'checkout-tenant-iso-a',
        email: 'checkout-tenant-iso-a@pos-erp.local',
        passwordHash,
      },
      update: {},
    });
    orgAUserId = user.id;
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });

    const branchA = await prisma.branch.upsert({
      where: {
        organizationId_code: { organizationId: orgAId, code: 'E2E-BR-TI-A' },
      },
      create: {
        organizationId: orgAId,
        code: 'E2E-BR-TI-A',
        name: 'Chi nhánh A (Tenant Iso)',
      },
      update: {},
    });
    branchAId = branchA.id;

    const warehouseA = await prisma.warehouse.upsert({
      where: {
        organizationId_code: { organizationId: orgAId, code: 'E2E-WH-TI-A' },
      },
      create: {
        organizationId: orgAId,
        branchId: branchAId,
        code: 'E2E-WH-TI-A',
        name: 'Kho A (Tenant Iso)',
      },
      update: {},
    });
    warehouseAId = warehouseA.id;

    // Org B — chỉ cần tồn tại làm mục tiêu "bị tấn công", không cần user/role/permission đầy đủ.
    const branchB = await prisma.branch.upsert({
      where: {
        organizationId_code: { organizationId: orgBId, code: 'E2E-BR-TI-B' },
      },
      create: {
        organizationId: orgBId,
        code: 'E2E-BR-TI-B',
        name: 'Chi nhánh B (Tenant Iso)',
      },
      update: {},
    });
    branchBId = branchB.id;

    const warehouseB = await prisma.warehouse.upsert({
      where: {
        organizationId_code: { organizationId: orgBId, code: 'E2E-WH-TI-B' },
      },
      create: {
        organizationId: orgBId,
        branchId: branchBId,
        code: 'E2E-WH-TI-B',
        name: 'Kho B (Tenant Iso)',
      },
      update: {},
    });
    warehouseBId = warehouseB.id;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await createE2eApp(moduleFixture);

    orgAToken = app.get(JwtService).sign({
      sub: orgAUserId,
      organizationId: orgAId,
      branchId: branchAId,
      email: user.email,
      permissions: permissions.map((p) => p.code),
      permissionVersion: user.permissionVersion,
    });

    productId = await seedProductForOrgA();

    inventoryRepository = app.get<IInventoryRepository>(INVENTORY_REPOSITORY);
    await prisma.$transaction((tx) =>
      inventoryRepository.recordMovement(tx, {
        organizationId: orgAId,
        warehouseId: warehouseAId,
        productId,
        movementType: 'INITIAL',
        referenceType: 'SYSTEM',
        quantity: 100,
        unitCost: 80000,
        checkNegativeStock: false,
        createdBy: orgAUserId,
      }),
    );
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('A. Org A checkout dùng Branch B (Warehouse A hợp lệ) — bị từ chối, không tạo Invoice/Payment/Inventory nào tham chiếu Org B', async () => {
    await addToCart();
    const idempotencyKey = `e2e-attack-branch-${Date.now()}`;

    const res = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${orgAToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        branchId: branchBId,
        warehouseId: warehouseAId,
        paymentMethod: 'CASH',
      })
      .expect(404);
    expect(res.body.code).toBe('BRANCH_001');

    await assertNoCrossTenantContamination();

    // CheckoutOperation: reserve() ĐÃ chạy (kiến trúc reserve-first không đổi) nhưng dừng ở
    // FAILED — KHÔNG BAO GIỜ COMPLETED, KHÔNG invoiceId/paymentId nào được gán.
    const operation = await prisma.checkoutOperation.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: orgAId,
          idempotencyKey,
        },
      },
    });
    expect(operation).not.toBeNull();
    expect(operation!.status).toBe('FAILED');
    expect(operation!.invoiceId).toBeNull();
    expect(operation!.paymentId).toBeNull();
  });

  it('B. Org A checkout dùng Warehouse B (Branch A hợp lệ) — bị từ chối, không tạo Invoice/Payment/Inventory nào tham chiếu Org B', async () => {
    await addToCart();
    const idempotencyKey = `e2e-attack-warehouse-${Date.now()}`;

    const res = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${orgAToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        branchId: branchAId,
        warehouseId: warehouseBId,
        paymentMethod: 'CASH',
      })
      .expect(404);
    expect(res.body.code).toBe('WAREHOUSE_001');

    await assertNoCrossTenantContamination();

    const operation = await prisma.checkoutOperation.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: orgAId,
          idempotencyKey,
        },
      },
    });
    expect(operation).not.toBeNull();
    expect(operation!.status).toBe('FAILED');
    expect(operation!.invoiceId).toBeNull();
    expect(operation!.paymentId).toBeNull();
  });

  it('C. Org A checkout dùng CẢ Branch B lẫn Warehouse B — bị từ chối, không tạo Invoice/Payment/Inventory nào tham chiếu Org B', async () => {
    await addToCart();
    const idempotencyKey = `e2e-attack-both-${Date.now()}`;

    // Branch được xác minh trước Warehouse trong checkout.service.ts — BRANCH_NOT_FOUND là lỗi
    // đầu tiên chạm phải.
    const res = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${orgAToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        branchId: branchBId,
        warehouseId: warehouseBId,
        paymentMethod: 'CASH',
      })
      .expect(404);
    expect(res.body.code).toBe('BRANCH_001');

    await assertNoCrossTenantContamination();
  });

  it('D. Org A checkout dùng Branch A + Warehouse A hợp lệ — vẫn thành công như trước fix', async () => {
    await addToCart();
    const idempotencyKey = `e2e-legit-${Date.now()}`;

    const res = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${orgAToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        branchId: branchAId,
        warehouseId: warehouseAId,
        paymentMethod: 'CASH',
      })
      .expect(201);

    expect(res.body.data.invoice.status).toBe('PAID');

    const operation = await prisma.checkoutOperation.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: orgAId,
          idempotencyKey,
        },
      },
    });
    expect(operation).not.toBeNull();
    expect(operation!.status).toBe('COMPLETED');
  });

  it('E. Retry với CÙNG Idempotency-Key sau khi bị từ chối do Branch sai — reclaim thành công khi sửa đúng Branch/Warehouse của mình, không bị "poison"', async () => {
    const idempotencyKey = `e2e-retry-reclaim-${Date.now()}`;

    // Lần 1: tấn công bằng Branch B — bị từ chối, CheckoutOperation dừng ở FAILED.
    await addToCart();
    await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${orgAToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        branchId: branchBId,
        warehouseId: warehouseAId,
        paymentMethod: 'CASH',
      })
      .expect(404);

    const failedOperation = await prisma.checkoutOperation.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: orgAId,
          idempotencyKey,
        },
      },
    });
    expect(failedOperation!.status).toBe('FAILED');

    // Lần 2: CÙNG idempotencyKey, sửa đúng Branch/Warehouse của Org A — phải reclaim thành công,
    // không bị coi là "key đã dùng cho payload khác" (payload khác branchId → hash khác → đúng
    // hành vi reclaim của tryReclaim(), không phải conflict — xem checkout-operation.service.ts).
    await addToCart();
    const retryRes = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${orgAToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        branchId: branchAId,
        warehouseId: warehouseAId,
        paymentMethod: 'CASH',
      })
      .expect(201);
    expect(retryRes.body.data.invoice.status).toBe('PAID');

    const completedOperation = await prisma.checkoutOperation.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: orgAId,
          idempotencyKey,
        },
      },
    });
    expect(completedOperation!.status).toBe('COMPLETED');
    expect(completedOperation!.invoiceId).not.toBeNull();

    await assertNoCrossTenantContamination();
  });
});
