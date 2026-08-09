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
 * Integration Test — Customer CRUD/search/soft-delete/restore, mã tự sinh CUSxxxxxx,
 * ràng buộc phone unique trong Organization (Prompt 031) với Postgres thật. Cùng giới
 * hạn với các *.e2e-spec.ts trước: KHÔNG tự chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- customer.e2e-spec.ts
 */
describe('Customer Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'customer-e2e' },
      create: {
        code: 'CUSTOMER-E2E',
        displayName: 'Customer E2E Org',
        slug: 'customer-e2e',
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
        organizationId_code: { organizationId, code: 'customer_e2e_role' },
      },
      create: {
        organizationId,
        code: 'customer_e2e_role',
        name: 'Customer E2E Role',
      },
      update: {},
    });

    const customerPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'customer:' } },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: customerPermissions.map((p) => ({
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
          email: 'cus-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'cus-e2e',
        email: 'cus-e2e@pos-erp.local',
        passwordHash,
      },
      update: {},
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await createE2eApp(moduleFixture);

    accessToken = app.get(JwtService).sign({
      sub: user.id,
      organizationId,
      branchId: null,
      email: user.email,
      permissions: customerPermissions.map((p) => p.code),
      permissionVersion: user.permissionVersion,
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('luồng đầy đủ: create (mã CUSxxxxxx tự sinh) → search → findOne → update → soft-delete → 404 → restore → 200', async () => {
    const phone = `09${Date.now().toString().slice(-8)}`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Nguyễn Văn A', phone })
      .expect(201);
    const customerId = created.body.data.id;
    expect(created.body.data.code).toMatch(/^CUS\d{6}$/);
    expect(created.body.data.customerType).toBe('RETAIL');
    expect(created.body.data.currentDebt).toBe('0');
    expect(created.body.data.totalPoint).toBe(0);

    const search = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .query({ search: 'Nguyễn Văn A' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      search.body.data.items.some((c: { id: string }) => c.id === customerId),
    ).toBe(true);

    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        version: created.body.data.version,
        fullName: 'Nguyễn Văn B',
        customerType: 'VIP',
      })
      .expect(200);
    expect(updated.body.data.fullName).toBe('Nguyễn Văn B');
    expect(updated.body.data.customerType).toBe('VIP');

    await request(app.getHttpServer())
      .delete(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: updated.body.data.version })
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    // T030.12F — DELETE trả 204 (không có body), không đọc được version đã tăng sau xóa qua
    // response API — CustomerVersionDto đòi hỏi version hiện tại. Đọc trực tiếp qua Prisma để lấy
    // đúng version mới nhất trước khi gọi restore (cùng mẫu đã dùng ở supplier.e2e-spec.ts).
    const afterDelete = await prisma.customer.findUnique({
      where: { id: customerId },
    });
    const restored = await request(app.getHttpServer())
      .post(`/api/v1/customers/${customerId}/restore`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: afterDelete!.version })
      .expect(201);
    expect(restored.body.data.id).toBe(customerId);

    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  // T030.12L/T030.12M — RFC-T011 Decision CR06/SR09: Phone không còn unique.
  it('SAME-PHONE-ALLOWED: cho phép tạo 2 khách hàng cùng số điện thoại trong cùng Organization', async () => {
    const phone = `08${Date.now().toString().slice(-8)}`;
    const first = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Khách gốc', phone })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Khách trùng SĐT', phone })
      .expect(201);

    expect(second.body.data.id).not.toBe(first.body.data.id);
    expect(second.body.data.phone).toBe(first.body.data.phone);

    const [firstRow, secondRow] = await Promise.all([
      prisma.customer.findUnique({ where: { id: first.body.data.id } }),
      prisma.customer.findUnique({ where: { id: second.body.data.id } }),
    ]);
    expect(secondRow!.organizationId).toBe(firstRow!.organizationId);
  });

  it('RESTORE-NOT-DELETED: từ chối khôi phục khách hàng chưa bị xóa', async () => {
    const phone = `07${Date.now().toString().slice(-8)}`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Khách chưa xóa', phone })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/customers/${created.body.data.id}/restore`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: created.body.data.version })
      .expect(422);
  });

  it('ARCHIVED-VISIBILITY (T048.05): create → archive → mặc định không thấy → status=ARCHIVED thấy → restore → status=ARCHIVED hết thấy → mặc định thấy lại', async () => {
    const phone = `05${Date.now().toString().slice(-8)}`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Khách hàng lưu trữ T048.05', phone })
      .expect(201);
    const customerId = created.body.data.id;

    await request(app.getHttpServer())
      .delete(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: created.body.data.version })
      .expect(204);

    const defaultAfterArchive = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .query({ search: 'Khách hàng lưu trữ T048.05' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      defaultAfterArchive.body.data.items.some(
        (c: { id: string }) => c.id === customerId,
      ),
    ).toBe(false);

    const archivedList = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .query({ search: 'Khách hàng lưu trữ T048.05', status: 'ARCHIVED' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      archivedList.body.data.items.some(
        (c: { id: string }) => c.id === customerId,
      ),
    ).toBe(true);

    const afterDelete = await prisma.customer.findUnique({
      where: { id: customerId },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/customers/${customerId}/restore`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: afterDelete!.version })
      .expect(201);

    const archivedAfterRestore = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .query({ search: 'Khách hàng lưu trữ T048.05', status: 'ARCHIVED' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      archivedAfterRestore.body.data.items.some(
        (c: { id: string }) => c.id === customerId,
      ),
    ).toBe(false);

    const defaultAfterRestore = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .query({ search: 'Khách hàng lưu trữ T048.05' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      defaultAfterRestore.body.data.items.some(
        (c: { id: string }) => c.id === customerId,
      ),
    ).toBe(true);
  });

  it('ARCHIVED-VISIBILITY tenant isolation (T048.05): status=ARCHIVED không lộ khách hàng lưu trữ của Organization khác', async () => {
    const otherOrganization = await prisma.organization.upsert({
      where: { slug: 'customer-e2e-other' },
      create: {
        code: 'CUSTOMER-E2E-OTHER',
        displayName: 'Customer E2E Other Org',
        slug: 'customer-e2e-other',
      },
      update: {},
    });
    const otherPasswordHash = await argon2.hash('E2ePass@123', {
      type: argon2.argon2id,
    });
    const otherUser = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId: otherOrganization.id,
          email: 'cus-e2e-other@pos-erp.local',
        },
      },
      create: {
        organizationId: otherOrganization.id,
        username: 'cus-e2e-other',
        email: 'cus-e2e-other@pos-erp.local',
        passwordHash: otherPasswordHash,
      },
      update: {},
    });
    const otherRole = await prisma.role.upsert({
      where: {
        organizationId_code: {
          organizationId: otherOrganization.id,
          code: 'customer_e2e_role',
        },
      },
      create: {
        organizationId: otherOrganization.id,
        code: 'customer_e2e_role',
        name: 'Customer E2E Role',
      },
      update: {},
    });
    const customerPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'customer:' } },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: otherRole.id },
    });
    await prisma.rolePermission.createMany({
      data: customerPermissions.map((p) => ({
        roleId: otherRole.id,
        permissionId: p.id,
      })),
      skipDuplicates: true,
    });
    await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: otherUser.id, roleId: otherRole.id },
      },
      create: { userId: otherUser.id, roleId: otherRole.id },
      update: {},
    });
    const otherAccessToken = app.get(JwtService).sign({
      sub: otherUser.id,
      organizationId: otherOrganization.id,
      branchId: null,
      email: otherUser.email,
      permissions: customerPermissions.map((p) => p.code),
      permissionVersion: otherUser.permissionVersion,
    });

    const phone = `04${Date.now().toString().slice(-8)}`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Khách hàng cách ly Org T048.05', phone })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/customers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: created.body.data.version })
      .expect(204);

    const otherOrgArchivedList = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .query({ status: 'ARCHIVED' })
      .set('Authorization', `Bearer ${otherAccessToken}`)
      .expect(200);
    expect(
      otherOrgArchivedList.body.data.items.some(
        (c: { id: string }) => c.id === created.body.data.id,
      ),
    ).toBe(false);
  });

  it('GET /customers hỗ trợ lọc theo customerType', async () => {
    const phone = `06${Date.now().toString().slice(-8)}`;
    await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Khách sỉ', phone, customerType: 'WHOLESALE' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .query({ customerType: 'WHOLESALE' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      res.body.data.items.every(
        (c: { customerType: string }) => c.customerType === 'WHOLESALE',
      ),
    ).toBe(true);
  });
});
