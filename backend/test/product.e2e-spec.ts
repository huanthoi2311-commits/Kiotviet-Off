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
 * Integration Test — Prisma + PostgreSQL thật + Transaction rollback (Prompt 016).
 *
 * Chạy tự động trong CI (`e2e` job, `.github/workflows/backend-ci.yml`) trên Postgres/Redis thật
 * (service container GitHub Actions) — không còn PENDING như ghi chú T005 ban đầu. Chạy thủ công
 * bằng: `npm run test:e2e -- product.e2e-spec.ts` sau khi
 * `docker compose up -d postgres redis && npx prisma migrate deploy`.
 *
 * T043.05: `PRODUCT_REFACTOR_ENABLED=true` trong cả CI (`e2e` job) và `backend/.env.example` —
 * các test bên dưới xác nhận Optimistic Lock / PRODUCT_008 / PRODUCT_012 THẬT SỰ được thực thi,
 * không chỉ đúng ở unit test có mock (`product.service.spec.ts`).
 */
describe('Product Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let categoryId: string;
  let brandId: string;
  let unitId: string;
  let warehouseId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'product-e2e' },
      create: {
        code: 'PRODUCT-E2E',
        displayName: 'Product E2E Org',
        slug: 'product-e2e',
      },
      update: {},
    });
    organizationId = organization.id;
    // T053.05B - to chuc test fixture nay tao truc tiep qua prisma.organization.upsert (khong qua writeOrganizationWithOwner), KHONG tu dong co OrganizationSubscription - can them thu cong de UsageLimitService.getLimit() khong fail-closed.
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

    // T043.05 — cần Branch/Warehouse thật để seed 1 dòng InventoryAdjustmentItem, dùng cho test
    // PRODUCT_008 (hasTransactionHistory() truy vấn Postgres thật, không mock).
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

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await createE2eApp(moduleFixture);

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
          type: 'STANDARD',
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

    // T030.12D — 3 test dưới đây chứng minh trực tiếp phát hiện của "PRODUCT TYPE CONTRACT
    // INVESTIGATION REPORT — T030.12C": thiếu ValidationPipe ở tầng bootstrap E2E khiến request
    // thiếu/sai `type` lọt thẳng xuống Prisma (500), thay vì bị chặn ở biên API (400) như production
    // thật. Sau khi backend/test/helpers/create-e2e-app.ts được migrate vào toàn bộ E2E suite, 3
    // test này khẳng định hành vi ĐÚNG đã được khôi phục cho riêng Product module.
    it('[T030.12D] thiếu `type` → 400 (KHÔNG lọt xuống repository/Prisma, KHÔNG còn 500)', async () => {
      const productCountBefore = await prisma.product.count({
        where: { organizationId },
      });

      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          categoryId,
          unitId,
          name: 'Sản phẩm thiếu type E2E',
          costPrice: 10000,
          prices: [{ type: 'RETAIL', price: 20000 }],
        })
        .expect(400);

      const productCountAfter = await prisma.product.count({
        where: { organizationId },
      });
      expect(productCountAfter).toBe(productCountBefore);
    });

    it('[T030.12D] `type` không nằm trong danh sách hợp lệ → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          categoryId,
          unitId,
          type: 'NOT_A_REAL_TYPE',
          name: 'Sản phẩm type sai E2E',
          costPrice: 10000,
          prices: [{ type: 'RETAIL', price: 20000 }],
        })
        .expect(400);
    });

    it('[T030.12D] field lạ không khai báo trong CreateProductDto → 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          type: 'STANDARD',
          categoryId,
          unitId,
          name: 'Sản phẩm field lạ E2E',
          costPrice: 10000,
          prices: [{ type: 'RETAIL', price: 20000 }],
          notARealField: 'x',
        })
        .expect(400);
    });

    it('trả 422 khi thiếu giá RETAIL', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          type: 'STANDARD',
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
          type: 'STANDARD',
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
          type: 'STANDARD',
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
          type: 'STANDARD',
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
          type: 'STANDARD',
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
      // T030.12D — UpdateProductDto.version là field bắt buộc (Optimistic Lock, SPEC-PRODUCT-001
      // §7.1), test này trước đây chưa từng gửi field này — ValidationPipe (mới được khôi phục ở
      // E2E, xem createE2eApp()) lẽ ra đã chặn payload thiếu field bắt buộc này ngay từ đầu; sản
      // phẩm vừa tạo ở test 'create' ngay phía trên luôn có version=1 (SPEC-PRODUCT-001, chưa qua
      // lần update nào).
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ version: 1, name: 'Sản phẩm vòng đời E2E (đã sửa)' })
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

  // T043.05 — trước sub-sprint này, PRODUCT_REFACTOR_ENABLED mặc định false trong mọi môi trường
  // thật (kể cả CI), nên 3 rule dưới đây (đã có sẵn trong code từ T005, đã unit-test bằng mock)
  // chưa từng thực sự chạy qua 1 request HTTP thật. Nhóm test này là bằng chứng thật đầu tiên.
  describe('PRODUCT_REFACTOR_ENABLED=true — Optimistic Lock / Type guard / Archive guard', () => {
    it('PATCH với version đã cũ (bị vượt qua bởi lần update trước) → 409 PRODUCT_013', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          type: 'STANDARD',
          categoryId,
          unitId,
          name: 'Optimistic Lock E2E',
          costPrice: 10000,
          prices: [{ type: 'RETAIL', price: 20000 }],
        })
        .expect(201);
      const id = createRes.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/products/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ version: 1, name: 'Optimistic Lock E2E (sửa lần 1)' })
        .expect(200);

      const conflict = await request(app.getHttpServer())
        .patch(`/api/v1/products/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ version: 1, name: 'Optimistic Lock E2E (xung đột)' })
        .expect(409);
      expect(conflict.body.code).toBe('PRODUCT_013');
    });

    it('PATCH đổi type sau khi đã phát sinh giao dịch (InventoryAdjustmentItem) → 422 PRODUCT_008', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          type: 'STANDARD',
          categoryId,
          unitId,
          name: 'Type Guard E2E',
          costPrice: 10000,
          prices: [{ type: 'RETAIL', price: 20000 }],
        })
        .expect(201);
      const id = createRes.body.data.id;

      const adjustment = await prisma.inventoryAdjustment.create({
        data: {
          organizationId,
          warehouseId,
          code: `E2E-ADJ-${Date.now()}`,
          status: 'DRAFT',
          reason: 'OTHER',
        },
      });
      await prisma.inventoryAdjustmentItem.create({
        data: { adjustmentId: adjustment.id, productId: id, quantity: 5 },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/products/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ version: 1, type: 'SERVICE' })
        .expect(422);
      expect(res.body.code).toBe('PRODUCT_008');
    });

    it('DELETE Variant Parent còn Variant Child ACTIVE → 422 PRODUCT_012; sau khi Archive Child thì Archive Parent thành công', async () => {
      const parentRes = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          type: 'VARIANT_PARENT',
          categoryId,
          unitId,
          name: 'Variant Parent E2E',
          costPrice: 10000,
          prices: [{ type: 'RETAIL', price: 20000 }],
        })
        .expect(201);
      const parentId = parentRes.body.data.id;

      const childRes = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          type: 'VARIANT_CHILD',
          parentProductId: parentId,
          categoryId,
          unitId,
          name: 'Variant Child E2E',
          costPrice: 10000,
          prices: [{ type: 'RETAIL', price: 20000 }],
        })
        .expect(201);
      const childId = childRes.body.data.id;
      expect(childRes.body.data.status).toBe('ACTIVE');

      const blocked = await request(app.getHttpServer())
        .delete(`/api/v1/products/${parentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(422);
      expect(blocked.body.code).toBe('PRODUCT_012');

      await request(app.getHttpServer())
        .delete(`/api/v1/products/${childId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .delete(`/api/v1/products/${parentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });
  });

  // T043.07 — SPEC-T043.07 §14/§17. Xác nhận Product Price Contract (Architect Decision T043.06:
  // Option 2, set-level versioning, bulk-replace) hoạt động thật qua HTTP + Postgres thật, và quan
  // trọng nhất: Product.version (core) KHÔNG đổi khi chỉ sửa price — bằng chứng 2 concurrency
  // boundary thực sự độc lập, không chỉ đặt tên khác nhau.
  describe('Product Price Contract (T043.07) — GET/PATCH /products/:id/prices', () => {
    async function createProduct(prices: { type: string; price: number }[]) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          type: 'STANDARD',
          categoryId,
          unitId,
          name: `Price Contract E2E ${Date.now()}`,
          costPrice: 10000,
          prices,
        })
        .expect(201);
      return res.body.data.id as string;
    }

    it('GET trả về price set vừa tạo, priceVersion = 1', async () => {
      const id = await createProduct([{ type: 'RETAIL', price: 100000 }]);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/products/${id}/prices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.productId).toBe(id);
      expect(res.body.data.priceVersion).toBe(1);
      expect(res.body.data.prices).toHaveLength(1);
      expect(res.body.data.prices[0].type).toBe('RETAIL');
    });

    it('PATCH với priceVersion đúng thay thế toàn bộ set, tăng priceVersion; Product.version (core) KHÔNG đổi', async () => {
      const id = await createProduct([{ type: 'RETAIL', price: 100000 }]);

      const before = await request(app.getHttpServer())
        .get(`/api/v1/products/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const coreVersionBefore = before.body.data.version;

      const patched = await request(app.getHttpServer())
        .patch(`/api/v1/products/${id}/prices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          priceVersion: 1,
          prices: [
            { type: 'RETAIL', price: 120000 },
            { type: 'WHOLESALE', price: 90000 },
          ],
        })
        .expect(200);

      expect(patched.body.data.priceVersion).toBe(2);
      expect(patched.body.data.prices).toHaveLength(2);

      const after = await request(app.getHttpServer())
        .get(`/api/v1/products/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(after.body.data.version).toBe(coreVersionBefore);
    });

    it('PATCH với priceVersion cũ → 409 PRODUCT_PRICE_001', async () => {
      const id = await createProduct([{ type: 'RETAIL', price: 100000 }]);

      await request(app.getHttpServer())
        .patch(`/api/v1/products/${id}/prices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ priceVersion: 1, prices: [{ type: 'RETAIL', price: 110000 }] })
        .expect(200);

      const conflict = await request(app.getHttpServer())
        .patch(`/api/v1/products/${id}/prices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ priceVersion: 1, prices: [{ type: 'RETAIL', price: 130000 }] })
        .expect(409);
      expect(conflict.body.code).toBe('PRODUCT_PRICE_001');
    });

    it('PATCH với 2 dòng cùng type → 422 PRODUCT_PRICE_002, không đổi set hiện tại', async () => {
      const id = await createProduct([{ type: 'RETAIL', price: 100000 }]);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/products/${id}/prices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          priceVersion: 1,
          prices: [
            { type: 'RETAIL', price: 100000 },
            { type: 'RETAIL', price: 200000 },
          ],
        })
        .expect(422);
      expect(res.body.code).toBe('PRODUCT_PRICE_002');

      const unchanged = await request(app.getHttpServer())
        .get(`/api/v1/products/${id}/prices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(unchanged.body.data.priceVersion).toBe(1);
    });

    it('PATCH bỏ hết RETAIL → 422 PRODUCT_007, không đổi set hiện tại', async () => {
      const id = await createProduct([{ type: 'RETAIL', price: 100000 }]);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/products/${id}/prices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          priceVersion: 1,
          prices: [{ type: 'WHOLESALE', price: 90000 }],
        })
        .expect(422);
      expect(res.body.code).toBe('PRODUCT_007');

      const unchanged = await request(app.getHttpServer())
        .get(`/api/v1/products/${id}/prices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(unchanged.body.data.priceVersion).toBe(1);
      expect(unchanged.body.data.prices[0].type).toBe('RETAIL');
    });

    it('GET/PATCH trên productId không tồn tại → 404 PRODUCT_001', async () => {
      const missingId = '00000000-0000-0000-0000-000000000000';
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/products/${missingId}/prices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      expect(getRes.body.code).toBe('PRODUCT_001');

      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/products/${missingId}/prices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ priceVersion: 1, prices: [{ type: 'RETAIL', price: 100000 }] })
        .expect(404);
      expect(patchRes.body.code).toBe('PRODUCT_001');
    });
  });
});
