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
 * T051.06B — Tenant-Owned Foreign-ID Hardening across PurchaseOrder/Transfer/StockCount/
 * InventoryAdjustment. Trước fix này, các module này dùng branchId/supplierId/warehouseId/
 * productId trực tiếp từ request body mà KHÔNG xác minh thuộc actor.organizationId — khác hẳn
 * `customerId`/`voucherCode`/`productId` trong Checkout (đã vá ở T051.06A). Vì `Inventory` chỉ có
 * unique key `(warehouseId, productId)` — KHÔNG có organizationId — một khi warehouseId/productId
 * giả mạo lọt tới `InventoryDomainService`/`recordMovement()`, việc ghi có thể trực tiếp làm hỏng
 * dữ liệu tồn kho THẬT của tổ chức khác (T051.06 audit finding).
 *
 * Suite này chứng minh cả 4 gate từ NGOÀI process, qua Postgres/Redis thật — 2 tổ chức thật, dữ
 * liệu Inventory CÓ SẴN với số lượng/giá vốn đã biết trước cho Org B, request HTTP thật. KHÔNG tự
 * chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- tenant-owned-foreign-id-hardening.e2e-spec.ts
 */
describe('Tenant-Owned Foreign-ID Hardening (e2e, T051.06B)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let inventoryRepository: IInventoryRepository;

  let orgAId: string;
  let orgBId: string;
  let branchAId: string;
  let branchBId: string;
  let warehouseAId: string;
  let warehouseBId: string;
  let supplierAId: string;
  let supplierBId: string;
  let productAId: string;
  let productBId: string;
  let orgAToken: string;
  let orgAUserId: string;

  const ORG_B_KNOWN_QUANTITY = 50;
  const ORG_B_KNOWN_UNIT_COST = 30000;

  async function assertOrgBInventoryUnchanged(): Promise<void> {
    const orgBInventory = await prisma.inventory.findUnique({
      where: {
        warehouseId_productId: {
          warehouseId: warehouseBId,
          productId: productBId,
        },
      },
    });
    expect(orgBInventory).not.toBeNull();
    expect(orgBInventory!.organizationId).toBe(orgBId);
    expect(Number(orgBInventory!.quantity)).toBe(ORG_B_KNOWN_QUANTITY);
    expect(Number(orgBInventory!.avgCost)).toBe(ORG_B_KNOWN_UNIT_COST);
    expect(Number(orgBInventory!.lastCost)).toBe(ORG_B_KNOWN_UNIT_COST);
  }

  async function assertNoImpossibleRelations(): Promise<void> {
    // Không PurchaseOrder/Transfer/StockCount/InventoryAdjustment nào của Org A được tham chiếu
    // Branch/Supplier/Warehouse của Org B.
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: {
        organizationId: orgAId,
        OR: [{ branchId: branchBId }, { supplierId: supplierBId }],
      },
    });
    expect(purchaseOrders).toHaveLength(0);

    const purchaseItemsForeignWarehouse = await prisma.purchaseItem.findMany({
      where: {
        warehouseId: warehouseBId,
        purchaseOrder: { organizationId: orgAId },
      },
    });
    expect(purchaseItemsForeignWarehouse).toHaveLength(0);

    const transfers = await prisma.transfer.findMany({
      where: {
        organizationId: orgAId,
        OR: [
          { fromWarehouseId: warehouseBId },
          { toWarehouseId: warehouseBId },
        ],
      },
    });
    expect(transfers).toHaveLength(0);

    const stockCounts = await prisma.stockCount.findMany({
      where: { organizationId: orgAId, warehouseId: warehouseBId },
    });
    expect(stockCounts).toHaveLength(0);

    const adjustments = await prisma.inventoryAdjustment.findMany({
      where: { organizationId: orgAId, warehouseId: warehouseBId },
    });
    expect(adjustments).toHaveLength(0);

    // Không InventoryMovement nào của Org A tham chiếu Warehouse của Org B.
    const movements = await prisma.inventoryMovement.findMany({
      where: { organizationId: orgAId, warehouseId: warehouseBId },
    });
    expect(movements).toHaveLength(0);

    // Không Inventory nào của Org A tham chiếu Warehouse của Org B.
    const inventoryRows = await prisma.inventory.findMany({
      where: { organizationId: orgAId, warehouseId: warehouseBId },
    });
    expect(inventoryRows).toHaveLength(0);

    // Org B's Inventory row bản thân không bị đổi bởi bất kỳ workflow nào của Org A.
    await assertOrgBInventoryUnchanged();
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
      where: { slug: 'tenant-fk-hardening-org-a' },
      create: {
        code: 'ORG-FK-HARDEN-A',
        displayName: 'Tenant FK Hardening Org A',
        slug: 'tenant-fk-hardening-org-a',
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
      where: { slug: 'tenant-fk-hardening-org-b' },
      create: {
        code: 'ORG-FK-HARDEN-B',
        displayName: 'Tenant FK Hardening Org B',
        slug: 'tenant-fk-hardening-org-b',
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
        organizationId_code: { organizationId: orgAId, code: 'fk_harden_role' },
      },
      create: {
        organizationId: orgAId,
        code: 'fk_harden_role',
        name: 'FK Hardening E2E Role',
      },
      update: {},
    });
    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { code: { startsWith: 'purchase:' } },
          { code: { startsWith: 'transfer:' } },
          { code: { startsWith: 'stock_count:' } },
          { code: { startsWith: 'inventory:' } },
          { code: { startsWith: 'product:' } },
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
          email: 'fk-harden-a@pos-erp.local',
        },
      },
      create: {
        organizationId: orgAId,
        username: 'fk-harden-a',
        email: 'fk-harden-a@pos-erp.local',
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
        organizationId_code: { organizationId: orgAId, code: 'E2E-FK-BR-A' },
      },
      create: {
        organizationId: orgAId,
        code: 'E2E-FK-BR-A',
        name: 'Chi nhánh A (FK Hardening)',
      },
      update: {},
    });
    branchAId = branchA.id;

    const warehouseA = await prisma.warehouse.upsert({
      where: {
        organizationId_code: { organizationId: orgAId, code: 'E2E-FK-WH-A' },
      },
      create: {
        organizationId: orgAId,
        branchId: branchAId,
        code: 'E2E-FK-WH-A',
        name: 'Kho A (FK Hardening)',
      },
      update: {},
    });
    warehouseAId = warehouseA.id;

    const supplierA = await prisma.supplier.upsert({
      where: {
        organizationId_code: { organizationId: orgAId, code: 'E2E-FK-NCC-A' },
      },
      create: {
        organizationId: orgAId,
        code: 'E2E-FK-NCC-A',
        companyName: 'Nhà cung cấp A (FK Hardening)',
      },
      update: {},
    });
    supplierAId = supplierA.id;

    // Org B — hạ tầng mục tiêu "bị tấn công" + 1 Inventory row CÓ SẴN với số lượng/giá vốn đã biết.
    const branchB = await prisma.branch.upsert({
      where: {
        organizationId_code: { organizationId: orgBId, code: 'E2E-FK-BR-B' },
      },
      create: {
        organizationId: orgBId,
        code: 'E2E-FK-BR-B',
        name: 'Chi nhánh B (FK Hardening)',
      },
      update: {},
    });
    branchBId = branchB.id;

    const warehouseB = await prisma.warehouse.upsert({
      where: {
        organizationId_code: { organizationId: orgBId, code: 'E2E-FK-WH-B' },
      },
      create: {
        organizationId: orgBId,
        branchId: branchBId,
        code: 'E2E-FK-WH-B',
        name: 'Kho B (FK Hardening)',
      },
      update: {},
    });
    warehouseBId = warehouseB.id;

    const supplierB = await prisma.supplier.upsert({
      where: {
        organizationId_code: { organizationId: orgBId, code: 'E2E-FK-NCC-B' },
      },
      create: {
        organizationId: orgBId,
        code: 'E2E-FK-NCC-B',
        companyName: 'Nhà cung cấp B (FK Hardening)',
      },
      update: {},
    });
    supplierBId = supplierB.id;

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

    // Product A (thuộc Org A, tạo qua API bằng token Org A) + Product B (thuộc Org B, tạo thẳng
    // qua Prisma vì Org B không có token/HTTP access trong suite này — chỉ cần tồn tại làm mục
    // tiêu tấn công).
    const categoryA = await prisma.category.upsert({
      where: {
        organizationId_code: { organizationId: orgAId, code: 'E2E-FK-CAT-A' },
      },
      create: {
        organizationId: orgAId,
        code: 'E2E-FK-CAT-A',
        name: 'Danh mục A (FK Hardening)',
        slug: 'danh-muc-a-fk-hardening',
      },
      update: {},
    });
    const unitA = await prisma.unit.upsert({
      where: {
        organizationId_code: { organizationId: orgAId, code: 'E2E-FK-UNIT-A' },
      },
      create: {
        organizationId: orgAId,
        code: 'E2E-FK-UNIT-A',
        name: 'Cái',
        symbol: 'cái-fk-a',
      },
      update: {},
    });
    const productARes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({
        type: 'STANDARD',
        categoryId: categoryA.id,
        unitId: unitA.id,
        name: `Sản phẩm A FK hardening e2e ${Date.now()}`,
        costPrice: 10000,
        prices: [{ type: 'RETAIL', price: 20000 }],
      })
      .expect(201);
    productAId = productARes.body.data.id;

    const categoryB = await prisma.category.upsert({
      where: {
        organizationId_code: { organizationId: orgBId, code: 'E2E-FK-CAT-B' },
      },
      create: {
        organizationId: orgBId,
        code: 'E2E-FK-CAT-B',
        name: 'Danh mục B (FK Hardening)',
        slug: 'danh-muc-b-fk-hardening',
      },
      update: {},
    });
    const unitB = await prisma.unit.upsert({
      where: {
        organizationId_code: { organizationId: orgBId, code: 'E2E-FK-UNIT-B' },
      },
      create: {
        organizationId: orgBId,
        code: 'E2E-FK-UNIT-B',
        name: 'Cái',
        symbol: 'cái-fk-b',
      },
      update: {},
    });
    const productB = await prisma.product.create({
      data: {
        organizationId: orgBId,
        categoryId: categoryB.id,
        unitId: unitB.id,
        sku: `SP-FK-B-${Date.now()}`,
        slug: `san-pham-b-fk-hardening-${Date.now()}`,
        name: 'Sản phẩm B (FK Hardening)',
        type: 'STANDARD',
        status: 'ACTIVE',
        costPrice: 10000,
      },
    });
    productBId = productB.id;

    // Seed Org A's own inventory (đủ hàng để giao dịch hợp lệ) + Org B's KNOWN pre-existing
    // inventory (mục tiêu chứng minh KHÔNG bị Org A chạm vào).
    inventoryRepository = app.get<IInventoryRepository>(INVENTORY_REPOSITORY);
    await prisma.$transaction((tx) =>
      inventoryRepository.recordMovement(tx, {
        organizationId: orgAId,
        warehouseId: warehouseAId,
        productId: productAId,
        movementType: 'INITIAL',
        referenceType: 'SYSTEM',
        quantity: 100,
        unitCost: 8000,
        checkNegativeStock: false,
        createdBy: orgAUserId,
      }),
    );
    await prisma.$transaction((tx) =>
      inventoryRepository.recordMovement(tx, {
        organizationId: orgBId,
        warehouseId: warehouseBId,
        productId: productBId,
        movementType: 'INITIAL',
        referenceType: 'SYSTEM',
        quantity: ORG_B_KNOWN_QUANTITY,
        unitCost: ORG_B_KNOWN_UNIT_COST,
        checkNegativeStock: false,
        createdBy: orgAUserId,
      }),
    );
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ============================================================
  // Gate A — Purchase Order
  // ============================================================
  describe('Gate A — Purchase Order', () => {
    it('A1. branchId của Org B — từ chối (404 BRANCH_001), không tạo PurchaseOrder', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/purchase-orders')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({
          branchId: branchBId,
          supplierId: supplierAId,
          items: [
            {
              productId: productAId,
              warehouseId: warehouseAId,
              quantity: 10,
              unitCost: 8000,
            },
          ],
        })
        .expect(404);
      expect(res.body.code).toBe('BRANCH_001');
    });

    it('A2. supplierId của Org B — từ chối (404 SUPPLIER_001), không tạo PurchaseOrder', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/purchase-orders')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({
          branchId: branchAId,
          supplierId: supplierBId,
          items: [
            {
              productId: productAId,
              warehouseId: warehouseAId,
              quantity: 10,
              unitCost: 8000,
            },
          ],
        })
        .expect(404);
      expect(res.body.code).toBe('SUPPLIER_001');
    });

    it('A3. warehouseId (dòng hàng) của Org B — từ chối (404 WAREHOUSE_001), không tạo PurchaseOrder', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/purchase-orders')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({
          branchId: branchAId,
          supplierId: supplierAId,
          items: [
            {
              productId: productAId,
              warehouseId: warehouseBId,
              quantity: 10,
              unitCost: 8000,
            },
          ],
        })
        .expect(404);
      expect(res.body.code).toBe('WAREHOUSE_001');
    });

    it('A4. productId (dòng hàng) của Org B — từ chối (404 PRODUCT_001), không tạo PurchaseOrder', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/purchase-orders')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({
          branchId: branchAId,
          supplierId: supplierAId,
          items: [
            {
              productId: productBId,
              warehouseId: warehouseAId,
              quantity: 10,
              unitCost: 8000,
            },
          ],
        })
        .expect(404);
      expect(res.body.code).toBe('PRODUCT_001');
    });

    it('A5. Branch/Supplier/Warehouse/Product hợp lệ (Org A) — vẫn thành công như trước fix, approve+receive không đụng Org B', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/purchase-orders')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({
          branchId: branchAId,
          supplierId: supplierAId,
          items: [
            {
              productId: productAId,
              warehouseId: warehouseAId,
              quantity: 5,
              unitCost: 8000,
            },
          ],
        })
        .expect(201);
      const id = created.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/purchase-orders/${id}/approve`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .expect(200);

      const received = await request(app.getHttpServer())
        .patch(`/api/v1/purchase-orders/${id}/receive`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({ version: 1 })
        .expect(200);
      expect(received.body.data.status).toBe('RECEIVED');

      await assertOrgBInventoryUnchanged();
    });
  });

  // ============================================================
  // Gate B — Transfer
  // ============================================================
  describe('Gate B — Transfer', () => {
    it('B1. fromWarehouseId của Org B — từ chối (404 WAREHOUSE_001), không tạo Transfer', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/transfers')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({
          fromWarehouseId: warehouseBId,
          toWarehouseId: warehouseAId,
          items: [{ productId: productAId, quantity: 5 }],
        })
        .expect(404);
      expect(res.body.code).toBe('WAREHOUSE_001');
    });

    it('B2. toWarehouseId của Org B — từ chối (404 WAREHOUSE_001), không tạo Transfer', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/transfers')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({
          fromWarehouseId: warehouseAId,
          toWarehouseId: warehouseBId,
          items: [{ productId: productAId, quantity: 5 }],
        })
        .expect(404);
      expect(res.body.code).toBe('WAREHOUSE_001');
    });

    it('B3. productId của Org B — từ chối (404 PRODUCT_001), không tạo Transfer', async () => {
      // Cần 1 kho A thứ hai để tránh lỗi "kho nguồn == kho đích" — dùng warehouseA cho from, tạo
      // nhanh 1 warehouse A thứ hai làm đích hợp lệ.
      const warehouseA2 = await prisma.warehouse.upsert({
        where: {
          organizationId_code: { organizationId: orgAId, code: 'E2E-FK-WH-A2' },
        },
        create: {
          organizationId: orgAId,
          branchId: branchAId,
          code: 'E2E-FK-WH-A2',
          name: 'Kho A2 (FK Hardening)',
        },
        update: {},
      });
      const res = await request(app.getHttpServer())
        .post('/api/v1/transfers')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({
          fromWarehouseId: warehouseAId,
          toWarehouseId: warehouseA2.id,
          items: [{ productId: productBId, quantity: 5 }],
        })
        .expect(404);
      expect(res.body.code).toBe('PRODUCT_001');
    });

    it('B4. fromWarehouseId/toWarehouseId/productId hợp lệ (Org A) — vẫn thành công như trước fix', async () => {
      const warehouseA3 = await prisma.warehouse.upsert({
        where: {
          organizationId_code: { organizationId: orgAId, code: 'E2E-FK-WH-A3' },
        },
        create: {
          organizationId: orgAId,
          branchId: branchAId,
          code: 'E2E-FK-WH-A3',
          name: 'Kho A3 (FK Hardening)',
        },
        update: {},
      });
      const created = await request(app.getHttpServer())
        .post('/api/v1/transfers')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({
          fromWarehouseId: warehouseAId,
          toWarehouseId: warehouseA3.id,
          items: [{ productId: productAId, quantity: 2 }],
        })
        .expect(201);
      expect(created.body.data.status).toBe('PENDING');

      await assertOrgBInventoryUnchanged();
    });
  });

  // ============================================================
  // Gate C — Stock Count (2 lớp phòng thủ: service-level + repository snapshot)
  // ============================================================
  describe('Gate C — Stock Count', () => {
    it('C1. warehouseId của Org B — từ chối (404 WAREHOUSE_001), không tạo StockCount, không rò rỉ systemQty', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/stock-count')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({ warehouseId: warehouseBId, productIds: [productAId] })
        .expect(404);
      expect(res.body.code).toBe('WAREHOUSE_001');
    });

    it('C2. productId của Org B — từ chối (404 PRODUCT_001), không tạo StockCount', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/stock-count')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({ warehouseId: warehouseAId, productIds: [productBId] })
        .expect(404);
      expect(res.body.code).toBe('PRODUCT_001');
    });

    it('C3. RÒ RỈ ĐỌC (read leak) — Org A KHÔNG BAO GIỜ học được systemQty/số lượng tồn kho thật của Org B qua Stock Count, kể cả khi request bị từ chối', async () => {
      // Kịch bản tấn công chính xác: warehouseId + productId ĐÚNG của Org B (combo đã có Inventory
      // thật, quantity=50, avgCost=30000) — trước fix, response sẽ include systemQty=50 (rò rỉ).
      // Sau fix, request bị từ chối NGAY ở bước validate warehouseId (Layer 1), không bao giờ chạm
      // tới query snapshot Inventory (Layer 2) — nhưng test này verify CẢ HAI lớp độc lập:
      const res = await request(app.getHttpServer())
        .post('/api/v1/stock-count')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({ warehouseId: warehouseBId, productIds: [productBId] })
        .expect(404);
      // T052.04B — response không được chứa bất kỳ dấu vết nào của systemQty=50 (giá trị thật của
      // Org B). Chỉ kiểm tra `code`/`message`/`errors` — 2 field còn lại của envelope
      // (`traceId`: UUID sinh ngẫu nhiên qua `crypto.randomUUID()`, `request-id.middleware.ts`;
      // `timestamp`: giờ hiện tại) không bao giờ có thể mang giá trị nghiệp vụ bị rò rỉ (không phụ
      // thuộc DB/quantity), nhưng 1 UUID 32 ký tự hex có ~11% xác suất ngẫu nhiên chứa chuỗi con
      // "50" — xác nhận qua chính log CI thật đã từng ghi nhận (traceId "...cf1b50fc...") khiến
      // test flake ĐÚNG NGAY tại dòng này trong khi `code` vẫn luôn là WAREHOUSE_001 chính xác (an
      // toàn thật, chỉ assertion sai — không có PROD defect). Whitelist 3 field này thay vì
      // stringify cả `res.body` không làm YẾU khả năng phát hiện rò rỉ thật: bất kỳ field nghiệp vụ
      // nào lỡ xuất hiện trong `message`/`errors` (hoặc `code`) vẫn được kiểm tra đầy đủ — envelope
      // lỗi hiện tại (`HttpExceptionFilter`) không có field nào khác ngoài `success`/`traceId`/
      // `timestamp` có thể mang dữ liệu.
      const { code, message, errors } = res.body;
      expect(JSON.stringify({ code, message, errors })).not.toContain('50');
      expect(res.body.code).toBe('WAREHOUSE_001');

      const leakedStockCounts = await prisma.stockCount.findMany({
        where: { organizationId: orgAId, warehouseId: warehouseBId },
      });
      expect(leakedStockCounts).toHaveLength(0);
    });

    it('C4. warehouseId/productIds hợp lệ (Org A) — vẫn thành công như trước fix, systemQty phản ánh đúng tồn kho CỦA CHÍNH Org A', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/stock-count')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({ warehouseId: warehouseAId, productIds: [productAId] })
        .expect(201);
      expect(created.body.data.status).toBe('DRAFT');
      // systemQty phải phản ánh tồn kho THẬT của Org A (đã seed 100, trừ đi các giao dịch trước đó
      // ở Gate A/B của cùng suite này — chỉ cần > 0 và khác 50 (giá trị của Org B) là đủ chứng minh
      // không lẫn lộn dữ liệu).
      const systemQty = Number(created.body.data.items[0].systemQty);
      expect(systemQty).not.toBe(ORG_B_KNOWN_QUANTITY);
      expect(systemQty).toBeGreaterThan(0);

      await assertOrgBInventoryUnchanged();
    });
  });

  // ============================================================
  // Gate D — Inventory Adjustment
  // ============================================================
  describe('Gate D — Inventory Adjustment', () => {
    it('D1. warehouseId của Org B — từ chối (404 WAREHOUSE_001), không tạo InventoryAdjustment', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory-adjustments')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({
          warehouseId: warehouseBId,
          reason: 'LOST',
          items: [{ productId: productAId, quantity: -1 }],
        })
        .expect(404);
      expect(res.body.code).toBe('WAREHOUSE_001');
    });

    it('D2. productId của Org B — từ chối (404 PRODUCT_001), không tạo InventoryAdjustment', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory-adjustments')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({
          warehouseId: warehouseAId,
          reason: 'LOST',
          items: [{ productId: productBId, quantity: -1 }],
        })
        .expect(404);
      expect(res.body.code).toBe('PRODUCT_001');
    });

    it('D3. warehouseId/productId hợp lệ (Org A) — vẫn thành công (create→submit→approve→complete), không đụng Org B', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/inventory-adjustments')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({
          warehouseId: warehouseAId,
          reason: 'FOUND',
          items: [{ productId: productAId, quantity: 1 }],
        })
        .expect(201);
      const id = created.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/inventory-adjustments/${id}/submit`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/inventory-adjustments/${id}/approve`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .expect(200);
      const completed = await request(app.getHttpServer())
        .patch(`/api/v1/inventory-adjustments/${id}/complete`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({ version: 1 })
        .expect(200);
      expect(completed.body.data.status).toBe('COMPLETED');
    });

    it('D4. Sau toàn bộ tấn công bị từ chối ở cả 4 Gate — không tồn tại quan hệ xuyên tổ chức bất khả thi nào, Inventory thật của Org B nguyên vẹn', async () => {
      await assertNoImpossibleRelations();
    });
  });
});
