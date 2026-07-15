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
 * Integration Test — POS Cart Engine (Prompt 033): giỏ hàng lưu hoàn toàn trong Redis
 * (không map bảng Postgres nào), "Một User → Một Cart", add/update/remove/clear, tính
 * price/tax snapshot theo Product thật. Cùng giới hạn với các *.e2e-spec.ts trước: KHÔNG
 * tự chạy được trong sandbox này (thiếu Docker/Redis).
 *   npm run test:e2e -- cart.e2e-spec.ts
 */
describe('Cart Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let productId: string;
  let notSellableProductId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'cart-e2e' },
      create: { name: 'Cart E2E Org', slug: 'cart-e2e' },
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
      where: { organizationId_code: { organizationId, code: 'cart_e2e_role' } },
      create: { organizationId, code: 'cart_e2e_role', name: 'Cart E2E Role' },
      update: {},
    });

    const permissions = await prisma.permission.findMany({
      where: {
        OR: [{ code: 'pos:access' }, { code: { startsWith: 'product:' } }],
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
        organizationId_email: { organizationId, email: 'cart-e2e@pos-erp.local' },
      },
      create: {
        organizationId,
        username: 'cart-e2e',
        email: 'cart-e2e@pos-erp.local',
        passwordHash,
      },
      update: {},
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });

    const category = await prisma.category.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-CAT-CART' } },
      create: {
        organizationId,
        code: 'E2E-CAT-CART',
        name: 'Danh mục E2E Cart',
        slug: 'danh-muc-e2e-cart',
      },
      update: {},
    });

    const unit = await prisma.unit.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-UNIT-CART' } },
      create: { organizationId, code: 'E2E-UNIT-CART', name: 'Cái', symbol: 'cái' },
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
      permissions: permissions.map((p) => p.code),
      permissionVersion: user.permissionVersion,
    });

    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        categoryId: category.id,
        unitId: unit.id,
        name: `Sản phẩm cart e2e ${Date.now()}`,
        costPrice: 80000,
        vat: 10,
        prices: [{ type: 'RETAIL', price: 100000 }],
      })
      .expect(201);
    productId = productRes.body.data.id;

    const notSellableRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        categoryId: category.id,
        unitId: unit.id,
        name: `Sản phẩm ngừng bán e2e ${Date.now()}`,
        costPrice: 50000,
        prices: [{ type: 'RETAIL', price: 60000 }],
      })
      .expect(201);
    notSellableProductId = notSellableRes.body.data.id;
    // API tạo Product hiện chưa cho set allowSale=false ngay khi tạo (Prompt 011) — cập nhật
    // trực tiếp qua Prisma để dựng fixture "sản phẩm ngừng bán" cho test CART-NOT-SELLABLE.
    await prisma.product.update({
      where: { id: notSellableProductId },
      data: { allowSale: false },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('luồng đầy đủ: add → add cộng dồn → update → remove → clear', async () => {
    const add1 = await request(app.getHttpServer())
      .post('/api/v1/cart/add')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId, quantity: 2 })
      .expect(201);
    expect(add1.body.data.items).toHaveLength(1);
    expect(add1.body.data.items[0].quantity).toBe('2.000');
    expect(add1.body.data.items[0].price).toBe('100000.00');
    expect(add1.body.data.items[0].tax).toBe('20000.00');
    expect(add1.body.data.items[0].total).toBe('220000.00');
    expect(add1.body.data.totalAmount).toBe('220000.00');

    const add2 = await request(app.getHttpServer())
      .post('/api/v1/cart/add')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId, quantity: 3 })
      .expect(201);
    expect(add2.body.data.items).toHaveLength(1);
    expect(add2.body.data.items[0].quantity).toBe('5.000');
    expect(add2.body.data.totalAmount).toBe('550000.00');

    const getCart = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(getCart.body.data.items[0].quantity).toBe('5.000');

    const updated = await request(app.getHttpServer())
      .patch('/api/v1/cart/update')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId, quantity: 1 })
      .expect(200);
    expect(updated.body.data.items[0].quantity).toBe('1.000');
    expect(updated.body.data.totalAmount).toBe('110000.00');

    const removed = await request(app.getHttpServer())
      .delete('/api/v1/cart/remove')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId })
      .expect(200);
    expect(removed.body.data.items).toEqual([]);
    expect(removed.body.data.totalAmount).toBe('0.00');

    await request(app.getHttpServer())
      .post('/api/v1/cart/add')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId, quantity: 1 })
      .expect(201);

    const cleared = await request(app.getHttpServer())
      .post('/api/v1/cart/clear')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(cleared.body.data.items).toEqual([]);

    const getAfterClear = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(getAfterClear.body.data.items).toEqual([]);
  });

  it('PRODUCT-NOT-FOUND: từ chối thêm sản phẩm không tồn tại', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/add')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId: '00000000-0000-0000-0000-000000000000', quantity: 1 })
      .expect(404);
  });

  it('NOT-SELLABLE: từ chối thêm sản phẩm không được phép bán', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/add')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId: notSellableProductId, quantity: 1 })
      .expect(422);
  });

  it('ITEM-NOT-FOUND: từ chối update/remove sản phẩm không có trong giỏ', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/clear')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .patch('/api/v1/cart/update')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId, quantity: 1 })
      .expect(404);

    await request(app.getHttpServer())
      .delete('/api/v1/cart/remove')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId })
      .expect(404);
  });
});
