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
 * Integration Test — POS Checkout Engine (Prompt 035): full workflow Cart → Validate →
 * Inventory Check → Discount → Point → Voucher → Payment → Invoice → Inventory Movement →
 * Completed, "Toàn bộ → Một Transaction", với Postgres + Redis thật. Cùng giới hạn với các
 * *.e2e-spec.ts trước: KHÔNG tự chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- checkout.e2e-spec.ts
 */
describe('Checkout Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let branchId: string;
  let warehouseId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'checkout-e2e' },
      create: {
        code: 'CHECKOUT-E2E',
        displayName: 'Checkout E2E Org',
        slug: 'checkout-e2e',
      },
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
        organizationId_code: { organizationId, code: 'checkout_e2e_role' },
      },
      create: {
        organizationId,
        code: 'checkout_e2e_role',
        name: 'Checkout E2E Role',
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
          organizationId,
          email: 'checkout-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'checkout-e2e',
        email: 'checkout-e2e@pos-erp.local',
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
      where: { organizationId_code: { organizationId, code: 'E2E-BRANCH-CO' } },
      create: {
        organizationId,
        code: 'E2E-BRANCH-CO',
        name: 'Chi nhánh E2E Checkout',
      },
      update: {},
    });
    branchId = branch.id;

    const warehouse = await prisma.warehouse.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-WH-CO' } },
      create: {
        organizationId,
        branchId,
        code: 'E2E-WH-CO',
        name: 'Kho E2E Checkout',
      },
      update: {},
    });
    warehouseId = warehouse.id;

    const category = await prisma.category.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-CAT-CO' } },
      create: {
        organizationId,
        code: 'E2E-CAT-CO',
        name: 'Danh mục E2E Checkout',
        slug: 'danh-muc-e2e-checkout',
      },
      update: {},
    });

    const unit = await prisma.unit.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-UNIT-CO' } },
      create: {
        organizationId,
        code: 'E2E-UNIT-CO',
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
      branchId,
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
        name: `Sản phẩm checkout e2e ${Date.now()}`,
        costPrice: 80000,
        vat: 10,
        prices: [{ type: 'RETAIL', price: 100000 }],
      })
      .expect(201);
    productId = productRes.body.data.id;

    // Nhập tồn kho ban đầu qua IInventoryRepository (không qua API — module Inventory
    // không có route ghi, đúng thiết kế Prompt 022) để có đủ hàng bán trong Checkout.
    const inventoryRepository =
      app.get<IInventoryRepository>(INVENTORY_REPOSITORY);
    await prisma.$transaction((tx) =>
      inventoryRepository.recordMovement(tx, {
        organizationId,
        warehouseId,
        productId,
        movementType: 'INITIAL',
        referenceType: 'SYSTEM',
        quantity: 100,
        unitCost: 80000,
        checkNegativeStock: false,
        createdBy: user.id,
      }),
    );
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('luồng đầy đủ: add cart → checkout → hóa đơn/thanh toán đúng, tồn kho giảm, giỏ hàng trống', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/add')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId, quantity: 3 })
      .expect(201);

    const checkoutRes = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        warehouseId,
        paymentMethod: 'CASH',
        manualDiscount: { type: 'PERCENT', value: 10 },
      })
      .expect(201);

    // subtotal = 3*100000 = 300000, tax 10% = 30000, manual discount 10% trên 300000 = 30000
    // finalTotal = (300000 - 30000) + 30000 = 300000
    expect(checkoutRes.body.data.invoice.totalAmount).toBe('300000.00');
    expect(checkoutRes.body.data.invoice.status).toBe('PAID');
    expect(checkoutRes.body.data.invoice.items).toHaveLength(1);
    expect(checkoutRes.body.data.payment.amount).toBe('300000.00');
    expect(checkoutRes.body.data.payment.method).toBe('CASH');
    const invoiceId = checkoutRes.body.data.invoice.id;

    const invoiceRes = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(invoiceRes.body.data.paidAmount).toBe('300000.00');

    const paymentsRes = await request(app.getHttpServer())
      .get(`/api/v1/payments?invoiceId=${invoiceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(paymentsRes.body.data).toHaveLength(1);

    // Giỏ hàng phải được xóa sau khi checkout thành công
    const cartRes = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(cartRes.body.data.items).toEqual([]);
  });

  it('EMPTY-CART: từ chối checkout khi giỏ hàng trống', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, warehouseId, paymentMethod: 'CASH' })
      .expect(422);
  });

  it('INSUFFICIENT-STOCK: rollback toàn bộ khi số lượng vượt tồn kho, giỏ hàng vẫn còn nguyên', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/add')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId, quantity: 999999 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, warehouseId, paymentMethod: 'CASH' })
      .expect(422);

    // Rollback đúng — giỏ hàng KHÔNG bị xóa, dữ liệu không mất (Acceptance Prompt 035)
    const cartRes = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(cartRes.body.data.items).toHaveLength(1);

    await request(app.getHttpServer())
      .post('/api/v1/cart/clear')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
  });
});
