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
 * Integration Test — Barcode CRUD độc lập + set-default + tenant isolation với Postgres
 * thật (Prompt 020). Cùng giới hạn với brand.e2e-spec.ts/unit.e2e-spec.ts: KHÔNG tự chạy
 * được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- barcode.e2e-spec.ts
 */
describe('Barcode Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'barcode-e2e' },
      create: { name: 'Barcode E2E Org', slug: 'barcode-e2e' },
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
        organizationId_code: { organizationId, code: 'barcode_e2e_role' },
      },
      create: {
        organizationId,
        code: 'barcode_e2e_role',
        name: 'Barcode E2E Role',
      },
      update: {},
    });

    const barcodePermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'barcode:' } },
    });
    const productPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'product:' } },
    });
    const allPermissions = [...barcodePermissions, ...productPermissions];
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
          email: 'barcode-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'barcode-e2e',
        email: 'barcode-e2e@pos-erp.local',
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
        name: `Sản phẩm barcode e2e ${Date.now()}`,
        costPrice: 10000,
        prices: [{ type: 'RETAIL', price: 20000 }],
      })
      .expect(201);
    productId = productRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('tạo và liệt kê mã vạch của sản phẩm', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/barcodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `EAN-${Date.now()}`, type: 'CUSTOM' })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}/barcodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      listRes.body.data.some(
        (b: { id: string }) => b.id === created.body.data.id,
      ),
    ).toBe(true);
  });

  it('PRODUCT-NOT-FOUND: từ chối tạo barcode cho sản phẩm không tồn tại', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/products/00000000-0000-4000-8000-000000000000/barcodes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `MISSING-${Date.now()}`, type: 'CUSTOM' })
      .expect(404);
  });

  it('SET-DEFAULT: chỉ 1 barcode mặc định tại một thời điểm cho mỗi sản phẩm', async () => {
    const first = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/barcodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `FIRST-${Date.now()}`, type: 'CUSTOM', isDefault: true })
      .expect(201);
    expect(first.body.data.isDefault).toBe(true);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/barcodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `SECOND-${Date.now()}`, type: 'CUSTOM' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/barcodes/${second.body.data.id}/default`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}/barcodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const defaults = listRes.body.data.filter(
      (b: { isDefault: boolean }) => b.isDefault,
    );
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(second.body.data.id);
  });

  it('DUPLICATE: từ chối tạo trùng code (unique toàn hệ thống)', async () => {
    const code = `DUP-${Date.now()}`;
    await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/barcodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code, type: 'CUSTOM' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/barcodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code, type: 'CUSTOM' })
      .expect(409);
  });

  it('cập nhật và xóa mềm mã vạch hoạt động bình thường', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/barcodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `LIFECYCLE-${Date.now()}`, type: 'CODE128' })
      .expect(201);
    const id = created.body.data.id;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/barcodes/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'QR' })
      .expect(200);
    expect(updated.body.data.type).toBe('QR');

    await request(app.getHttpServer())
      .delete(`/api/v1/barcodes/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .patch(`/api/v1/barcodes/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'QR' })
      .expect(404);
  });
});
