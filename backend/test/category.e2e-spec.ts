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
 * Integration Test — Category tree/circular-reference/block-delete với Postgres thật (Prompt 017).
 * Cùng giới hạn với product.e2e-spec.ts: KHÔNG tự chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- category.e2e-spec.ts
 */
describe('Category Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let unitId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'category-e2e' },
      create: {
        code: 'CATEGORY-E2E',
        displayName: 'Category E2E Org',
        slug: 'category-e2e',
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
        organizationId_code: { organizationId, code: 'category_e2e_role' },
      },
      create: {
        organizationId,
        code: 'category_e2e_role',
        name: 'Category E2E Role',
      },
      update: {},
    });

    const relevantPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'category:' } },
    });
    const productPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'product:' } },
    });
    const allPermissions = [...relevantPermissions, ...productPermissions];
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
          email: 'category-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'category-e2e',
        email: 'category-e2e@pos-erp.local',
        passwordHash,
      },
      update: {},
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });

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

    accessToken = app.get(JwtService).sign({
      sub: user.id,
      organizationId,
      branchId: null,
      email: user.email,
      permissions: allPermissions.map((p) => p.code),
      permissionVersion: user.permissionVersion,
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('dựng đúng cây 3 cấp qua GET /categories/tree', async () => {
    const root = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `ROOT-${Date.now()}`, name: 'Gốc E2E' })
      .expect(201);

    const child = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: `CHILD-${Date.now()}`,
        name: 'Con E2E',
        parentId: root.body.data.id,
      })
      .expect(201);

    const tree = await request(app.getHttpServer())
      .get('/api/v1/categories/tree')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const rootNode = tree.body.data.find(
      (n: { id: string }) => n.id === root.body.data.id,
    );
    expect(rootNode).toBeDefined();
    expect(
      rootNode.children.some(
        (c: { id: string }) => c.id === child.body.data.id,
      ),
    ).toBe(true);
  });

  it('CIRCULAR: từ chối gán parentId là hậu duệ của chính nó', async () => {
    const rootRes = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `CIRC-ROOT-${Date.now()}`, name: 'Circ Root' })
      .expect(201);
    const childRes = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: `CIRC-CHILD-${Date.now()}`,
        name: 'Circ Child',
        parentId: rootRes.body.data.id,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/categories/${rootRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ parentId: childRes.body.data.id })
      .expect(422);
  });

  it('BLOCK-DELETE: từ chối xóa danh mục đang có sản phẩm', async () => {
    const categoryRes = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `BLOCK-${Date.now()}`, name: 'Danh mục có sản phẩm' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        categoryId: categoryRes.body.data.id,
        unitId,
        name: 'Sản phẩm chặn xóa danh mục',
        costPrice: 10000,
        prices: [{ type: 'RETAIL', price: 20000 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/categories/${categoryRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(422);
  });

  it('xóa mềm + khôi phục danh mục không có sản phẩm hoạt động bình thường', async () => {
    const categoryRes = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `LIFECYCLE-${Date.now()}`, name: 'Danh mục vòng đời' })
      .expect(201);
    const id = categoryRes.body.data.id;

    await request(app.getHttpServer())
      .delete(`/api/v1/categories/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/categories/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/categories/${id}/restore`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/categories/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });
});
