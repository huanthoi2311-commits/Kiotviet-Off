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
 * Integration Test — Barcode CRUD, Optimistic Lock (PATCH/Archive/Restore/SetDefault — Decision
 * BQ10/SB02), Delete Guard (Decision BQ2), Unit Reference guard (Decision BQ11), unique theo tổ
 * chức (Decision BQ8, KHÔNG còn unique toàn cục — xem schema.prisma dòng 973-974) với Postgres
 * thật (SPEC-BARCODE-001 §12, Decision IP07). Cùng giới hạn với brand.e2e-spec.ts/unit.e2e-spec.ts:
 * KHÔNG tự chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- barcode.e2e-spec.ts
 */
describe('Barcode Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let productId: string;
  let unitId: string;

  // Tổ chức thứ 2 — dùng cho DUPLICATE-DIFFERENT-ORG và UNIT REFERENCE GUARD (Decision BQ8/BQ11).
  let accessToken2: string;
  let organizationId2: string;
  let otherOrgUnitId: string;

  async function setupOrg(slug: string, code: string) {
    const organization = await prisma.organization.upsert({
      where: { slug },
      create: { code, displayName: `${code} Org`, slug },
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
        organizationId_code: {
          organizationId: organization.id,
          code: `${slug}_role`,
        },
      },
      create: {
        organizationId: organization.id,
        code: `${slug}_role`,
        name: `${code} E2E Role`,
      },
      update: {},
    });

    const relevantPermissions = await prisma.permission.findMany({
      where: {
        code: {
          in: PERMISSION_CATALOG.filter(
            (p) =>
              p.code.startsWith('barcode:') ||
              p.code.startsWith('product:') ||
              p.code.startsWith('unit:'),
          ).map((p) => p.code),
        },
      },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: relevantPermissions.map((p) => ({
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
          organizationId: organization.id,
          email: `${slug}@pos-erp.local`,
        },
      },
      create: {
        organizationId: organization.id,
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

    const token = app.get(JwtService).sign({
      sub: user.id,
      organizationId: organization.id,
      branchId: null,
      email: user.email,
      permissions: relevantPermissions.map((p) => p.code),
      permissionVersion: user.permissionVersion,
    });

    return { organizationId: organization.id, token };
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    await app.init();

    const org1 = await setupOrg('barcode-e2e', 'BARCODE-E2E');
    organizationId = org1.organizationId;
    accessToken = org1.token;

    const org2 = await setupOrg('barcode-e2e-2', 'BARCODE-E2E-2');
    organizationId2 = org2.organizationId;
    accessToken2 = org2.token;

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
    unitId = unit.id;

    const otherOrgUnit = await prisma.unit.upsert({
      where: {
        organizationId_code: {
          organizationId: organizationId2,
          code: 'E2E-UNIT-2',
        },
      },
      create: {
        organizationId: organizationId2,
        code: 'E2E-UNIT-2',
        name: 'Cái (org 2)',
        symbol: 'cái',
      },
      update: {},
    });
    otherOrgUnitId = otherOrgUnit.id;

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
    expect(created.body.data.version).toBe(1);
    expect(created.body.data.status).toBe('ACTIVE');

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

  it('DUPLICATE: từ chối tạo trùng code trong cùng tổ chức (Decision BQ8)', async () => {
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

  it('DUPLICATE-DIFFERENT-ORG: cho phép trùng code giữa 2 tổ chức khác nhau (Decision BQ8, unique theo tổ chức, không còn toàn cục)', async () => {
    const category2 = await prisma.category.upsert({
      where: {
        organizationId_code: {
          organizationId: organizationId2,
          code: 'E2E-CAT-2',
        },
      },
      create: {
        organizationId: organizationId2,
        code: 'E2E-CAT-2',
        name: 'Danh mục E2E 2',
        slug: 'danh-muc-e2e-2',
      },
      update: {},
    });
    const product2Res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken2}`)
      .send({
        categoryId: category2.id,
        unitId: otherOrgUnitId,
        name: `Sản phẩm barcode e2e org2 ${Date.now()}`,
        costPrice: 10000,
        prices: [{ type: 'RETAIL', price: 20000 }],
      })
      .expect(201);

    const code = `CROSS-ORG-${Date.now()}`;
    await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/barcodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code, type: 'CUSTOM' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/products/${product2Res.body.data.id}/barcodes`)
      .set('Authorization', `Bearer ${accessToken2}`)
      .send({ code, type: 'CUSTOM' })
      .expect(201);
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
      .send({ version: second.body.data.version })
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

  it('cập nhật và xóa mềm mã vạch hoạt động bình thường (Optimistic Lock bắt buộc — Decision BQ10)', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/barcodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `LIFECYCLE-${Date.now()}`, type: 'CODE128' })
      .expect(201);
    const id = created.body.data.id;
    expect(created.body.data.version).toBe(1);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/barcodes/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1, type: 'QR' })
      .expect(200);
    expect(updated.body.data.type).toBe('QR');
    expect(updated.body.data.version).toBe(2);

    await request(app.getHttpServer())
      .delete(`/api/v1/barcodes/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 2 })
      .expect(204);

    await request(app.getHttpServer())
      .patch(`/api/v1/barcodes/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 2, type: 'QR' })
      .expect(404);
  });

  it('OPTIMISTIC LOCK: PATCH/Archive/Restore/SetDefault với version cũ đều bị từ chối 409 (Decision BQ10/SB02)', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/barcodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `LOCK-${Date.now()}`, type: 'CUSTOM' })
      .expect(201);
    const id = created.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/barcodes/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1, type: 'EAN8' })
      .expect(200);

    // version 1 giờ đã lỗi thời (bản ghi hiện tại là version 2) — cả 4 thao tác đều phải từ chối 409.
    await request(app.getHttpServer())
      .patch(`/api/v1/barcodes/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1, type: 'EAN13' })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/api/v1/barcodes/${id}/default`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1 })
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/api/v1/barcodes/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1 })
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/api/v1/barcodes/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 2 })
      .expect(204);

    // Barcode giờ đã xóa mềm ở version 3 — restore với version cũ (2) cũng phải từ chối 409.
    await request(app.getHttpServer())
      .post(`/api/v1/barcodes/${id}/restore`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 2 })
      .expect(409);
  });

  it('RESTORE: khôi phục mã vạch đã xóa mềm luôn trả status về INACTIVE, không tự động ACTIVE (Decision BQ3)', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/barcodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `RESTORE-${Date.now()}`, type: 'CUSTOM', status: 'ACTIVE' })
      .expect(201);
    const id = created.body.data.id;

    await request(app.getHttpServer())
      .delete(`/api/v1/barcodes/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1 })
      .expect(204);

    const restored = await request(app.getHttpServer())
      .post(`/api/v1/barcodes/${id}/restore`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 2 })
      .expect(201);
    expect(restored.body.data.status).toBe('INACTIVE');

    // Đã khôi phục rồi — restore lần 2 phải từ chối (chưa bị xóa).
    await request(app.getHttpServer())
      .post(`/api/v1/barcodes/${id}/restore`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 3 })
      .expect(422);
  });

  it('DELETE GUARD: chặn xóa mã mặc định khi Product đang ACTIVE; cho phép khi không phải mặc định (Decision BQ2/IP04)', async () => {
    const category = await prisma.category.upsert({
      where: { organizationId_code: { organizationId, code: 'E2E-CAT-GUARD' } },
      create: {
        organizationId,
        code: 'E2E-CAT-GUARD',
        name: 'Danh mục Delete Guard',
        slug: 'danh-muc-delete-guard',
      },
      update: {},
    });
    const guardProductRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        categoryId: category.id,
        unitId,
        name: `Sản phẩm Delete Guard ${Date.now()}`,
        costPrice: 10000,
        prices: [{ type: 'RETAIL', price: 20000 }],
      })
      .expect(201);
    const guardProductId = guardProductRes.body.data.id;

    const defaultBarcode = await request(app.getHttpServer())
      .post(`/api/v1/products/${guardProductId}/barcodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: `GUARD-DEFAULT-${Date.now()}`,
        type: 'CUSTOM',
        isDefault: true,
      })
      .expect(201);
    const otherBarcode = await request(app.getHttpServer())
      .post(`/api/v1/products/${guardProductId}/barcodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `GUARD-OTHER-${Date.now()}`, type: 'CUSTOM' })
      .expect(201);

    // FAIL: Product đang ACTIVE, xóa mã mặc định phải bị chặn.
    await request(app.getHttpServer())
      .delete(`/api/v1/barcodes/${defaultBarcode.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1 })
      .expect(422);

    // SUCCESS: mã không phải mặc định, dù Product đang ACTIVE vẫn xóa được.
    await request(app.getHttpServer())
      .delete(`/api/v1/barcodes/${otherBarcode.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1 })
      .expect(204);

    // Chuyển Product sang INACTIVE — giờ mã mặc định xóa được (Decision BQ2 chỉ chặn khi Product ACTIVE).
    await request(app.getHttpServer())
      .patch(`/api/v1/products/${guardProductId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1, status: 'INACTIVE' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/barcodes/${defaultBarcode.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1 })
      .expect(204);
  });

  it('UNIT REFERENCE GUARD: từ chối unitId thuộc tổ chức khác (Decision BQ11)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/barcodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: `UNIT-OTHER-ORG-${Date.now()}`,
        type: 'CUSTOM',
        unitId: otherOrgUnitId,
      })
      .expect(422);
  });

  it('UNIT REFERENCE GUARD: từ chối unitId đã bị Archive (Decision BQ11)', async () => {
    const archivedUnitRes = await request(app.getHttpServer())
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: `UNIT-ARCHIVE-${Date.now()}`,
        name: 'Đơn vị sẽ Archive',
        symbol: 'dv',
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/units/${archivedUnitRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/barcodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: `UNIT-ARCHIVED-${Date.now()}`,
        type: 'CUSTOM',
        unitId: archivedUnitRes.body.data.id,
      })
      .expect(422);
  });

  it('GET /barcodes: tìm kiếm theo code, lọc status, sắp xếp, phân trang (org-wide — SPEC §4.2/§12)', async () => {
    const marker = `QUERY-${Date.now()}`;
    const created = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/barcodes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: marker, type: 'CUSTOM', status: 'INACTIVE' })
      .expect(201);

    const searchRes = await request(app.getHttpServer())
      .get('/api/v1/barcodes')
      .query({ search: marker })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(searchRes.body.data.items).toHaveLength(1);
    expect(searchRes.body.data.items[0].id).toBe(created.body.data.id);
    expect(searchRes.body.data.total).toBe(1);

    const statusRes = await request(app.getHttpServer())
      .get('/api/v1/barcodes')
      .query({ search: marker, status: 'ACTIVE' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(statusRes.body.data.items).toHaveLength(0);

    const pagedRes = await request(app.getHttpServer())
      .get('/api/v1/barcodes')
      .query({ page: 1, limit: 1, sortBy: 'code', sortOrder: 'asc' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(pagedRes.body.data.items).toHaveLength(1);
    expect(pagedRes.body.data.limit).toBe(1);
  });
});
