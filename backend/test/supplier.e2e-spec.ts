import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PERMISSION_CATALOG } from '../src/modules/rbac/infrastructure/permission-catalog';

/**
 * Integration Test — Supplier CRUD/restore/Excel Import-Export/SupplierProduct mapping
 * với Postgres thật (Prompt 026). Cùng giới hạn với các *.e2e-spec.ts trước: KHÔNG tự
 * chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- supplier.e2e-spec.ts
 */
describe('Supplier Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'supplier-e2e' },
      create: { name: 'Supplier E2E Org', slug: 'supplier-e2e' },
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
        organizationId_code: { organizationId, code: 'supplier_e2e_role' },
      },
      create: {
        organizationId,
        code: 'supplier_e2e_role',
        name: 'Supplier E2E Role',
      },
      update: {},
    });

    const supplierPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'supplier:' } },
    });
    const productPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'product:' } },
    });
    const allPermissions = [...supplierPermissions, ...productPermissions];
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
          email: 'supplier-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'supplier-e2e',
        email: 'supplier-e2e@pos-erp.local',
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
        name: `Sản phẩm supplier e2e ${Date.now()}`,
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

  it('vòng đời đầy đủ: tạo → tìm kiếm → chi tiết → cập nhật → xóa mềm → khôi phục', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `NCC-${Date.now()}`, companyName: 'Công ty Đức An' })
      .expect(201);
    const id = created.body.data.id;
    expect(created.body.data.status).toBe('ACTIVE');

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/suppliers')
      .query({ search: 'Đức An' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      listRes.body.data.items.some((s: { id: string }) => s.id === id),
    ).toBe(true);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/suppliers/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ companyName: 'Công ty Đức An (đã sửa)' })
      .expect(200);
    expect(updated.body.data.companyName).toBe('Công ty Đức An (đã sửa)');

    await request(app.getHttpServer())
      .delete(`/api/v1/suppliers/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/suppliers/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/suppliers/${id}/restore`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/suppliers/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('DUPLICATE: từ chối tạo trùng code trong cùng tổ chức', async () => {
    const code = `DUP-${Date.now()}`;
    await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code, companyName: 'NCC gốc' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code, companyName: 'NCC trùng' })
      .expect(409);
  });

  it('BLOCK-DELETE: từ chối xóa nhà cung cấp đã có Purchase Order', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `HASPO-${Date.now()}`, companyName: 'NCC có đơn nhập' })
      .expect(201);

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
    await prisma.purchaseOrder.create({
      data: {
        organizationId,
        branchId: branch.id,
        warehouseId: warehouse.id,
        supplierId: created.body.data.id,
        code: `PO-${Date.now()}`,
      },
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/suppliers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(422);
  });

  it('SUPPLIER-PRODUCT: gán, liệt kê và bỏ gán sản phẩm cho nhà cung cấp', async () => {
    const supplierRes = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `SP-${Date.now()}`, companyName: 'NCC gán sản phẩm' })
      .expect(201);
    const supplierId = supplierRes.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/v1/suppliers/${supplierId}/products`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId, supplierSku: 'SKU-NCC-01', defaultPrice: 9000 })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/suppliers/${supplierId}/products`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].supplierSku).toBe('SKU-NCC-01');

    await request(app.getHttpServer())
      .delete(`/api/v1/suppliers/${supplierId}/products/${productId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    const afterRemove = await request(app.getHttpServer())
      .get(`/api/v1/suppliers/${supplierId}/products`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(afterRemove.body.data).toHaveLength(0);
  });

  it('EXPORT: xuất danh sách nhà cung cấp ra file Excel hợp lệ', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/suppliers/export')
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect((res.body as Buffer).subarray(0, 2).toString('ascii')).toBe('PK');
  });

  it('IMPORT: nhập file Excel hợp lệ tạo mới nhà cung cấp, rollback toàn bộ nếu có dòng lỗi', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Suppliers');
    worksheet.columns = [
      { header: 'Mã NCC', key: 'code' },
      { header: 'Tên công ty', key: 'companyName' },
    ];
    const importCode = `IMPORT-${Date.now()}`;
    worksheet.addRow({ code: importCode, companyName: 'NCC nhập từ Excel' });
    const validBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const importRes = await request(app.getHttpServer())
      .post('/api/v1/suppliers/import')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', validBuffer, 'suppliers.xlsx')
      .expect(201);
    expect(importRes.body.data.createdCount).toBe(1);

    const found = await request(app.getHttpServer())
      .get('/api/v1/suppliers')
      .query({ search: importCode })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      found.body.data.items.some(
        (s: { code: string }) => s.code === importCode,
      ),
    ).toBe(true);

    // Dòng thứ 2 thiếu companyName (bắt buộc) — cả file phải bị từ chối, không dòng nào được ghi.
    const invalidWorkbook = new ExcelJS.Workbook();
    const invalidSheet = invalidWorkbook.addWorksheet('Suppliers');
    invalidSheet.columns = [
      { header: 'Mã NCC', key: 'code' },
      { header: 'Tên công ty', key: 'companyName' },
    ];
    const validRowCode = `IMPORT-VALID-${Date.now()}`;
    invalidSheet.addRow({ code: validRowCode, companyName: 'Dòng hợp lệ' });
    invalidSheet.addRow({
      code: `IMPORT-INVALID-${Date.now()}`,
      companyName: '',
    });
    const invalidBuffer = Buffer.from(await invalidWorkbook.xlsx.writeBuffer());

    await request(app.getHttpServer())
      .post('/api/v1/suppliers/import')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', invalidBuffer, 'suppliers-invalid.xlsx')
      .expect(422);

    const notCreated = await request(app.getHttpServer())
      .get('/api/v1/suppliers')
      .query({ search: validRowCode })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(notCreated.body.data.items).toHaveLength(0);
  });
});
