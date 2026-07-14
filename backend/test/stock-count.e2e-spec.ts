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
 * Integration Test — Stock Count (System Qty chụp lúc tạo, Complete ghi actualQty +
 * sinh Adjustment/Movement nếu lệch) với Postgres thật (Prompt 024). Cùng giới hạn với
 * các *.e2e-spec.ts trước: KHÔNG tự chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- stock-count.e2e-spec.ts
 */
describe('StockCount Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let warehouseId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'stock-count-e2e' },
      create: { name: 'StockCount E2E Org', slug: 'stock-count-e2e' },
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
        organizationId_code: { organizationId, code: 'stock_count_e2e_role' },
      },
      create: {
        organizationId,
        code: 'stock_count_e2e_role',
        name: 'StockCount E2E Role',
      },
      update: {},
    });

    const stockCountPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'stock_count:' } },
    });
    const productPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'product:' } },
    });
    const allPermissions = [...stockCountPermissions, ...productPermissions];
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
          email: 'stock-count-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'stock-count-e2e',
        email: 'stock-count-e2e@pos-erp.local',
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
        name: `Sản phẩm stock-count e2e ${Date.now()}`,
        costPrice: 10000,
        prices: [{ type: 'RETAIL', price: 20000 }],
      })
      .expect(201);
    productId = productRes.body.data.id;

    const inventoryRepository =
      app.get<IInventoryRepository>(INVENTORY_REPOSITORY);
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
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('luồng đầy đủ: tạo (chụp System Qty=100) → start → complete (đếm được 95) → sinh Movement COUNT -5', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/stock-count')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ warehouseId, productIds: [productId] })
      .expect(201);
    const stockCountId = created.body.data.id;
    expect(created.body.data.status).toBe('DRAFT');
    expect(created.body.data.items[0].systemQty).toBe('100');
    const itemId = created.body.data.items[0].id;

    await request(app.getHttpServer())
      .patch(`/api/v1/stock-count/${stockCountId}/start`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const completed = await request(app.getHttpServer())
      .patch(`/api/v1/stock-count/${stockCountId}/complete`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [{ itemId, actualQty: 95, remark: 'Thiếu 5 do hao hụt' }],
      })
      .expect(200);

    expect(completed.body.data.status).toBe('COMPLETED');
    expect(completed.body.data.items[0].actualQty).toBe('95');
    expect(completed.body.data.items[0].difference).toBe('-5');

    const stock = await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .query({ warehouseId, productId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(stock.body.data.items[0].quantity).toBe('95');

    const history = await request(app.getHttpServer())
      .get('/api/v1/inventory/history')
      .query({ warehouseId, productId, movementType: 'COUNT' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(history.body.data.total).toBe(1);
    expect(history.body.data.items[0].quantity).toBe('-5');
  });

  it('INVALID-TRANSITION: từ chối start một phiếu không còn DRAFT', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/stock-count')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ warehouseId, productIds: [productId] })
      .expect(201);
    const stockCountId = created.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/stock-count/${stockCountId}/start`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/stock-count/${stockCountId}/start`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(422);
  });

  it('GET /stock-count hỗ trợ lọc theo status', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/stock-count')
      .query({ status: 'COMPLETED' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      res.body.data.items.every(
        (sc: { status: string }) => sc.status === 'COMPLETED',
      ),
    ).toBe(true);
  });
});
