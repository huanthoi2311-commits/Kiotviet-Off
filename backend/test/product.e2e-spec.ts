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
 * Integration Test — Prisma + PostgreSQL thật + Transaction rollback (Prompt 016).
 *
 * CHỈ chạy được khi có DATABASE_URL trỏ tới Postgres thật đang sống (Gate B —
 * xem docs/release-gates.md). Sandbox hiện tại không có Docker nên file này
 * KHÔNG được tự chạy để xác nhận pass; chạy thủ công bằng:
 *   npm run test:e2e -- product.e2e-spec.ts
 * sau khi `docker compose up -d postgres redis && npx prisma migrate deploy`.
 */
describe('Product Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let categoryId: string;
  let brandId: string;
  let unitId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'product-e2e' },
      create: { name: 'Product E2E Org', slug: 'product-e2e' },
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
        organizationId_code: { organizationId, code: 'product_e2e_role' },
      },
      create: {
        organizationId,
        code: 'product_e2e_role',
        name: 'Product E2E Role',
      },
      update: {},
    });

    const productPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'product:' } },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: productPermissions.map((p) => ({
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
          email: 'product-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'product-e2e',
        email: 'product-e2e@pos-erp.local',
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
    categoryId = category.id;

    const brand = await prisma.brand.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-BRAND' } },
      create: { organizationId, code: 'E2E-BRAND', name: 'Thương hiệu E2E' },
      update: {},
    });
    brandId = brand.id;

    const unit = await prisma.unit.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-UNIT' } },
      create: { organizationId, code: 'E2E-UNIT', name: 'Cái', symbol: 'cái' },
      update: {},
    });
    unitId = unit.id;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    await app.init();

    const jwtService = app.get(JwtService);
    accessToken = jwtService.sign({
      sub: user.id,
      organizationId,
      branchId: null,
      email: user.email,
      permissions: productPermissions.map((p) => p.code),
      permissionVersion: user.permissionVersion,
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /api/v1/products', () => {
    it('tạo sản phẩm thành công — SKU/slug tự sinh, prices/barcodes/images được lưu atomically', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          categoryId,
          brandId,
          unitId,
          name: 'Áo thun nam E2E',
          costPrice: 90000,
          vat: 8,
          prices: [{ type: 'RETAIL', price: 150000 }],
          barcodes: [{ code: `E2E-${Date.now()}`, type: 'EAN13' }],
          images: [{ url: 'https://cdn.example.com/e2e.jpg' }],
        })
        .expect(201);

      expect(res.body.data.sku).toMatch(/^SP\d{6}$/);
      expect(res.body.data.slug).toBe('ao-thun-nam-e2e');
      expect(res.body.data.prices).toHaveLength(1);
      expect(res.body.data.barcodes).toHaveLength(1);
      expect(res.body.data.images).toHaveLength(1);

      const inDb = await prisma.product.findUnique({
        where: { id: res.body.data.id },
      });
      expect(inDb).not.toBeNull();
    });

    it('trả 422 khi thiếu giá RETAIL', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          categoryId,
          unitId,
          name: 'Sản phẩm không có giá RETAIL',
          costPrice: 10000,
          prices: [{ type: 'WHOLESALE', price: 9000 }],
        })
        .expect(422);
    });

    it('trả 401 khi không có access token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .send({
          categoryId,
          unitId,
          name: 'x',
          costPrice: 1,
          prices: [{ type: 'RETAIL', price: 1 }],
        })
        .expect(401);
    });

    it('ROLLBACK: trùng barcode → không tạo Product mồ côi (transaction toàn vẹn)', async () => {
      const sharedBarcode = `E2E-DUP-${Date.now()}`;

      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          categoryId,
          unitId,
          name: 'Sản phẩm gốc giữ barcode',
          costPrice: 10000,
          prices: [{ type: 'RETAIL', price: 20000 }],
          barcodes: [{ code: sharedBarcode, type: 'EAN13' }],
        })
        .expect(201);

      const attemptName = 'Sản phẩm cố tạo trùng barcode - phải rollback';
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          categoryId,
          unitId,
          name: attemptName,
          costPrice: 10000,
          prices: [{ type: 'RETAIL', price: 20000 }],
          barcodes: [{ code: sharedBarcode, type: 'EAN13' }],
        })
        .expect(409);

      const orphan = await prisma.product.findFirst({
        where: { name: attemptName },
      });
      expect(orphan).toBeNull();
    });
  });

  describe('GET /api/v1/products', () => {
    it('tìm kiếm theo tên, phân trang đúng total', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .query({ search: 'E2E', page: 1, limit: 5 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.total).toBeGreaterThan(0);
      expect(res.body.data.items.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Vòng đời CRUD đầy đủ: create → get → update → delete → restore', () => {
    let productId: string;

    it('create', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          categoryId,
          unitId,
          name: 'Sản phẩm vòng đời E2E',
          costPrice: 50000,
          prices: [{ type: 'RETAIL', price: 80000 }],
        })
        .expect(201);
      productId = res.body.data.id;
    });

    it('get by id', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('update — đổi tên kéo theo đổi slug', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Sản phẩm vòng đời E2E (đã sửa)' })
        .expect(200);
      expect(res.body.data.slug).not.toBe('san-pham-vong-doi-e2e');
    });

    it('delete — xóa mềm, GET sau đó trả 404', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('restore — GET sau đó trả 200 trở lại', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/products/${productId}/restore`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });
});
