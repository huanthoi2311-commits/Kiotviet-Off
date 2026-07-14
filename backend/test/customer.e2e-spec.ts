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
      create: { name: 'Customer E2E Org', slug: 'customer-e2e' },
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
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    await app.init();

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
      .send({ fullName: 'Nguyễn Văn B', customerType: 'VIP' })
      .expect(200);
    expect(updated.body.data.fullName).toBe('Nguyễn Văn B');
    expect(updated.body.data.customerType).toBe('VIP');

    await request(app.getHttpServer())
      .delete(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    const restored = await request(app.getHttpServer())
      .post(`/api/v1/customers/${customerId}/restore`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(restored.body.data.id).toBe(customerId);

    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('DUPLICATE-PHONE: từ chối tạo khách hàng trùng số điện thoại trong cùng Organization', async () => {
    const phone = `08${Date.now().toString().slice(-8)}`;
    await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Khách gốc', phone })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Khách trùng SĐT', phone })
      .expect(409);
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
      .expect(422);
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
