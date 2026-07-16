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
 * Integration Test — Customer Point Ledger: add/use/history, chặn dùng vượt số dư, đồng bộ
 * Customer.totalPoint qua Domain Event (PointAdded/PointUsed → CustomerPointSubscriber,
 * Prompt 032) với Postgres thật. Cùng giới hạn với các *.e2e-spec.ts trước: KHÔNG tự chạy
 * được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- customer-point.e2e-spec.ts
 */
describe('CustomerPoint Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let customerId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'customer-point-e2e' },
      create: {
        code: 'CUSTOMER-POINT-E2E',
        displayName: 'CustomerPoint E2E Org',
        slug: 'customer-point-e2e',
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
        organizationId_code: { organizationId, code: 'cus_point_e2e_role' },
      },
      create: {
        organizationId,
        code: 'cus_point_e2e_role',
        name: 'CustomerPoint E2E Role',
      },
      update: {},
    });

    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { code: { startsWith: 'point:' } },
          { code: { startsWith: 'customer:' } },
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
          email: 'cus-point-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'cus-point-e2e',
        email: 'cus-point-e2e@pos-erp.local',
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
      permissions: permissions.map((p) => p.code),
      permissionVersion: user.permissionVersion,
    });

    const phone = `05${Date.now().toString().slice(-8)}`;
    const customerRes = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Khách hàng điểm E2E', phone })
      .expect(201);
    customerId = customerRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('luồng đầy đủ: add → add → use → history đúng thứ tự, số dư tích lũy đúng, Customer.totalPoint đồng bộ qua Domain Event', async () => {
    const add1 = await request(app.getHttpServer())
      .post('/api/v1/customer-point/add')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ customerId, point: 100, referenceType: 'ORDER' })
      .expect(201);
    expect(add1.body.data.point).toBe(100);
    expect(add1.body.data.balance).toBe(100);

    const add2 = await request(app.getHttpServer())
      .post('/api/v1/customer-point/add')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ customerId, point: 50, referenceType: 'PROMOTION' })
      .expect(201);
    expect(add2.body.data.balance).toBe(150);

    const use1 = await request(app.getHttpServer())
      .post('/api/v1/customer-point/use')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ customerId, point: 30, referenceType: 'ORDER' })
      .expect(201);
    expect(use1.body.data.point).toBe(-30);
    expect(use1.body.data.balance).toBe(120);

    const history = await request(app.getHttpServer())
      .get('/api/v1/customer-point/history')
      .query({ customerId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(history.body.data.total).toBe(3);
    expect(history.body.data.items[0].balance).toBe(120);
    expect(history.body.data.items[2].balance).toBe(100);

    // Xác nhận CustomerPointSubscriber đã đồng bộ đúng Customer.totalPoint qua Domain Event
    // (không phải CustomerPointService ghi trực tiếp vào bảng customers).
    const customerRes = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(customerRes.body.data.totalPoint).toBe(120);
  });

  it('EXCEEDS-BALANCE: từ chối dùng điểm vượt quá số dư hiện tại', async () => {
    const phone = `04${Date.now().toString().slice(-8)}`;
    const customerRes = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Khách chưa có điểm', phone })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/customer-point/use')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ customerId: customerRes.body.data.id, point: 10 })
      .expect(422);
  });

  it('CUSTOMER-NOT-FOUND: từ chối cộng điểm cho khách hàng không tồn tại', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/customer-point/add')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ customerId: '00000000-0000-0000-0000-000000000000', point: 10 })
      .expect(404);
  });
});
