import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { INVENTORY_REPOSITORY } from '../src/modules/inventory/domain/repositories/inventory.repository.interface';
import type { IInventoryRepository } from '../src/modules/inventory/domain/repositories/inventory.repository.interface';
import { PERMISSION_CATALOG } from '../src/modules/rbac/infrastructure/permission-catalog';

/**
 * Integration Test — Inventory Foundation (snapshot + movement ledger) với Postgres
 * thật (Prompt 022). Cùng giới hạn với các *.e2e-spec.ts trước: KHÔNG tự chạy được
 * trong sandbox này (thiếu Docker).
 *
 * Module này không có API ghi (chỉ 3 GET) — nên bài test gọi thẳng
 * IInventoryRepository.recordMovement() qua DI container (mô phỏng cách các module
 * nghiệp vụ tương lai như Purchase/POS/Transfer sẽ gọi), rồi xác nhận qua 3 API GET.
 *   npm run test:e2e -- inventory.e2e-spec.ts
 */
describe('Inventory Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let inventoryRepository: IInventoryRepository;
  let accessToken: string;
  let organizationId: string;
  let warehouseId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'inventory-e2e' },
      create: { name: 'Inventory E2E Org', slug: 'inventory-e2e' },
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
      where: {
        organizationId_code: { organizationId, code: 'inventory_e2e_role' },
      },
      create: {
        organizationId,
        code: 'inventory_e2e_role',
        name: 'Inventory E2E Role',
      },
      update: {},
    });

    const inventoryPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'inventory:' } },
    });
    const productPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'product:' } },
    });
    const allPermissions = [...inventoryPermissions, ...productPermissions];
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
          email: 'inventory-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'inventory-e2e',
        email: 'inventory-e2e@pos-erp.local',
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

    const category = await prisma.category.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-CAT' } },
      create: {
        organizationId,
        code: 'E2E-CAT',
        name: 'Danh mục E2E',
        slug: 'danh-muc-e2e',
      },
      update: {},
    });

    const unit = await prisma.unit.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-UNIT' } },
      create: { organizationId, code: 'E2E-UNIT', name: 'Cái', symbol: 'cái' },
      update: {},
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    await app.init();
    inventoryRepository = app.get<IInventoryRepository>(INVENTORY_REPOSITORY);

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
        name: `Sản phẩm inventory e2e ${Date.now()}`,
        costPrice: 10000,
        prices: [{ type: 'RETAIL', price: 20000 }],
      })
      .expect(201);
    productId = productRes.body.data.id;

    // Mô phỏng luồng nghiệp vụ: nhập kho ban đầu rồi bán ra — giống cách các module
    // Purchase/POS tương lai sẽ gọi recordMovement().
    await inventoryRepository.recordMovement({
      organizationId,
      warehouseId,
      productId,
      movementType: 'INITIAL',
      referenceType: 'SYSTEM',
      quantity: 100,
      unitCost: 50000,
      createdBy: user.id,
    });
    await inventoryRepository.recordMovement({
      organizationId,
      warehouseId,
      productId,
      movementType: 'SALE',
      referenceType: 'POS',
      quantity: -30,
      createdBy: user.id,
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('GET /inventory trả về snapshot đúng sau 2 movement (nhập 100, xuất 30)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .query({ warehouseId, productId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const row = res.body.data.items.find(
      (i: { productId: string; warehouseId: string }) =>
        i.productId === productId && i.warehouseId === warehouseId,
    );
    expect(row).toBeDefined();
    expect(row.quantity).toBe('70');
    expect(row.availableQty).toBe('70');
    expect(row.avgCost).toBe('50000');
  });

  it('GET /inventory/history trả về đúng 2 movement theo thứ tự mới nhất trước', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/inventory/history')
      .query({ warehouseId, productId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.total).toBe(2);
    const [latest, earliest] = res.body.data.items;
    expect(latest.movementType).toBe('SALE');
    expect(latest.quantity).toBe('-30');
    expect(latest.beforeQuantity).toBe('100');
    expect(latest.afterQuantity).toBe('70');
    expect(earliest.movementType).toBe('INITIAL');
    expect(earliest.beforeQuantity).toBe('0');
    expect(earliest.afterQuantity).toBe('100');
  });

  it('GET /inventory/product/:id trả về tồn kho của sản phẩm ở mọi kho', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/inventory/product/${productId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(
      res.body.data.some(
        (i: { warehouseId: string }) => i.warehouseId === warehouseId,
      ),
    ).toBe(true);
  });

  it('KHÔNG có API ghi trực tiếp — chỉ tồn tại 3 route GET cho /inventory', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ warehouseId, productId, quantity: 999 })
      .expect(404);
  });
});
