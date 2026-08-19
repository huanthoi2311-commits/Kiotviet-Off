import { INestApplication, Logger } from '@nestjs/common';
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
 * Integration Test — T053.05B Usage-Limit Enforcement (real Postgres, CASE theo Architect
 * Authorization). Org A dùng để test hạn mức (max* bị chỉnh động per-test qua `setLimit()`), Org B
 * chỉ dùng để chứng minh cô lập tenant (usage của Org B không bao giờ ảnh hưởng Org A).
 *
 * Mọi CASE dùng ĐẾM ĐỘNG (đọc currentUsage thật trước khi set limit) thay vì số tuyệt đối cứng —
 * để không phụ thuộc thứ tự chạy/ trạng thái tích luỹ giữa các test trong cùng file.
 *   npm run test:e2e -- usage-limit.e2e-spec.ts
 */
jest.setTimeout(120_000);

describe('Usage Limit Enforcement (e2e, integration) — T053.05B', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessTokenA: string;
  let accessTokenB: string;
  let orgAId: string;
  let orgBId: string;
  let branchAId: string;
  let branchBId: string;
  let categoryAId: string;
  let unitAId: string;

  function uniqueSuffix(): string {
    return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  }

  async function setLimit(
    orgId: string,
    field:
      'maxUser' | 'maxBranch' | 'maxWarehouse' | 'maxProduct' | 'maxCustomer',
    value: number | null,
  ): Promise<void> {
    await prisma.organizationSubscription.update({
      where: { organizationId: orgId },
      data: { [field]: value },
    });
  }

  async function countUsers(orgId: string): Promise<number> {
    return prisma.user.count({
      where: { organizationId: orgId, deletedAt: null },
    });
  }
  async function countActiveBranches(orgId: string): Promise<number> {
    return prisma.branch.count({
      where: { organizationId: orgId, status: 'ACTIVE' },
    });
  }
  async function countWarehouses(orgId: string): Promise<number> {
    return prisma.warehouse.count({
      where: { organizationId: orgId, deletedAt: null },
    });
  }
  async function countProducts(orgId: string): Promise<number> {
    return prisma.product.count({
      where: { organizationId: orgId, deletedAt: null },
    });
  }
  async function countCustomers(orgId: string): Promise<number> {
    return prisma.customer.count({
      where: { organizationId: orgId, deletedAt: null },
    });
  }

  async function setupOrg(
    slug: string,
    code: string,
  ): Promise<{
    organizationId: string;
    accessToken: string;
    branchId: string;
    categoryId: string;
    unitId: string;
  }> {
    const organization = await prisma.organization.upsert({
      where: { slug },
      create: { code, displayName: `${code} Org`, slug },
      update: {},
    });
    const organizationId = organization.id;
    // plan: TRIAL — cần entitlement USER_MANAGEMENT (User controller POST / gắn
    // @RequireEntitlement('USER_MANAGEMENT'), FREE mặc định KHÔNG có) để test User quota
    // (U1-U8/G1/G9) không bị chặn 403 trước khi tới bước kiểm tra hạn mức.
    await prisma.organizationSubscription.upsert({
      where: { organizationId },
      create: { organizationId, plan: 'TRIAL' },
      update: { plan: 'TRIAL' },
    });

    const role = await prisma.role.upsert({
      where: {
        organizationId_code: { organizationId, code: 'usage_limit_e2e_role' },
      },
      create: {
        organizationId,
        code: 'usage_limit_e2e_role',
        name: 'Usage Limit E2E Role',
      },
      update: {},
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const permissions = await prisma.permission.findMany();
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
          email: `${slug}@pos-erp.local`,
        },
      },
      create: {
        organizationId,
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

    const branch = await prisma.branch.upsert({
      where: { organizationId_code: { organizationId, code: `${code}-BR` } },
      create: { organizationId, code: `${code}-BR`, name: `${code} Branch` },
      update: {},
    });

    const category = await prisma.category.upsert({
      where: { organizationId_code: { organizationId, code: `${code}-CAT` } },
      create: {
        organizationId,
        code: `${code}-CAT`,
        name: `${code} Category`,
        slug: `${slug}-cat`,
      },
      update: {},
    });
    const unit = await prisma.unit.upsert({
      where: { organizationId_code: { organizationId, code: `${code}-UNIT` } },
      create: {
        organizationId,
        code: `${code}-UNIT`,
        name: 'Cái',
        symbol: 'cái',
      },
      update: {},
    });

    const accessToken = app.get(JwtService).sign({
      sub: user.id,
      organizationId,
      branchId: null,
      email: user.email,
      permissions: permissions.map((p) => p.code),
      permissionVersion: user.permissionVersion,
    });

    return {
      organizationId,
      accessToken,
      branchId: branch.id,
      categoryId: category.id,
      unitId: unit.id,
    };
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    for (const permission of PERMISSION_CATALOG) {
      await prisma.permission.upsert({
        where: { code: permission.code },
        create: permission,
        update: {},
      });
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await createE2eApp(moduleFixture);

    const orgA = await setupOrg('usage-limit-e2e-org-a', 'USAGE-LIMIT-A');
    orgAId = orgA.organizationId;
    accessTokenA = orgA.accessToken;
    branchAId = orgA.branchId;
    categoryAId = orgA.categoryId;
    unitAId = orgA.unitId;

    const orgB = await setupOrg('usage-limit-e2e-org-b', 'USAGE-LIMIT-B');
    orgBId = orgB.organizationId;
    accessTokenB = orgB.accessToken;
    branchBId = orgB.branchId;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // =========================================================================
  // USER
  // =========================================================================
  describe('User quota', () => {
    it('U1: dưới hạn mức → tạo thành công', async () => {
      const usage = await countUsers(orgAId);
      await setLimit(orgAId, 'maxUser', usage + 2);
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          username: `u1-${uniqueSuffix()}`,
          email: `u1-${uniqueSuffix()}@acme.test`,
          password: 'SuperSecret123',
        })
        .expect(201);
    });

    it('U2: đúng bằng hạn mức → 409 SUBSCRIPTION_USAGE_LIMIT_REACHED', async () => {
      const usage = await countUsers(orgAId);
      await setLimit(orgAId, 'maxUser', usage);
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          username: `u2-${uniqueSuffix()}`,
          email: `u2-${uniqueSuffix()}@acme.test`,
          password: 'SuperSecret123',
        })
        .expect(409);
      expect(res.body.code).toBe('SUBSCRIPTION_001');
      await expect(countUsers(orgAId)).resolves.toBe(usage);
    });

    it('U3: limit=null → không giới hạn, luôn thành công', async () => {
      await setLimit(orgAId, 'maxUser', null);
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          username: `u3-${uniqueSuffix()}`,
          email: `u3-${uniqueSuffix()}@acme.test`,
          password: 'SuperSecret123',
        })
        .expect(201);
    });

    it('U4: user của Org B không tính vào usage của Org A', async () => {
      const usageABefore = await countUsers(orgAId);
      await setLimit(orgBId, 'maxUser', null);
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessTokenB}`)
        .send({
          username: `u4b-${uniqueSuffix()}`,
          email: `u4b-${uniqueSuffix()}@acme.test`,
          password: 'SuperSecret123',
        })
        .expect(201);
      await expect(countUsers(orgAId)).resolves.toBe(usageABefore);
    });

    it('U5: 2 request đồng thời đúng seat cuối cùng → CHỈ 1 thành công, usage cuối = limit', async () => {
      const usage = await countUsers(orgAId);
      const limit = usage + 1;
      await setLimit(orgAId, 'maxUser', limit);
      const body = () => ({
        username: `u5-${uniqueSuffix()}-${Math.random()}`,
        email: `u5-${uniqueSuffix()}-${Math.random()}@acme.test`,
        password: 'SuperSecret123',
      });
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/users')
          .set('Authorization', `Bearer ${accessTokenA}`)
          .send(body()),
        request(app.getHttpServer())
          .post('/api/v1/users')
          .set('Authorization', `Bearer ${accessTokenA}`)
          .send(body()),
      ]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);
      await expect(countUsers(orgAId)).resolves.toBe(limit);
    });

    it('U6: usage đã VƯỢT limit (vd sau downgrade giả lập) → create tiếp tục bị từ chối, dữ liệu cũ không đổi', async () => {
      const usage = await countUsers(orgAId);
      await setLimit(orgAId, 'maxUser', Math.max(usage - 1, 0));
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          username: `u6-${uniqueSuffix()}`,
          email: `u6-${uniqueSuffix()}@acme.test`,
          password: 'SuperSecret123',
        })
        .expect(409);
      await expect(countUsers(orgAId)).resolves.toBe(usage);
    });

    it('U7/U8: user INACTIVE vẫn tính vào maxUser (deactivate KHÔNG giải phóng hạn mức)', async () => {
      await setLimit(orgAId, 'maxUser', null);
      const created = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          username: `u7-${uniqueSuffix()}`,
          email: `u7-${uniqueSuffix()}@acme.test`,
          password: 'SuperSecret123',
        })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${created.body.data.id}/deactivate`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(200);

      const usage = await countUsers(orgAId);
      await setLimit(orgAId, 'maxUser', usage);
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          username: `u7b-${uniqueSuffix()}`,
          email: `u7b-${uniqueSuffix()}@acme.test`,
          password: 'SuperSecret123',
        })
        .expect(409);
      expect(res.body.code).toBe('SUBSCRIPTION_001');
    });
  });

  // =========================================================================
  // BRANCH
  // =========================================================================
  describe('Branch quota (chỉ đếm ACTIVE)', () => {
    it('B1: dưới hạn mức → tạo thành công', async () => {
      const usage = await countActiveBranches(orgAId);
      await setLimit(orgAId, 'maxBranch', usage + 2);
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ name: 'Chi nhánh B1' })
        .expect(201);
    });

    it('B2: đúng bằng hạn mức → 409', async () => {
      const usage = await countActiveBranches(orgAId);
      await setLimit(orgAId, 'maxBranch', usage);
      const res = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ name: 'Chi nhánh B2' })
        .expect(409);
      expect(res.body.code).toBe('SUBSCRIPTION_001');
    });

    it('B3: limit=null → không giới hạn', async () => {
      await setLimit(orgAId, 'maxBranch', null);
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ name: 'Chi nhánh B3' })
        .expect(201);
    });

    it('B4: branch của Org B không tính vào usage Org A', async () => {
      const usageABefore = await countActiveBranches(orgAId);
      await setLimit(orgBId, 'maxBranch', null);
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessTokenB}`)
        .send({ name: 'Chi nhánh B4 Org B' })
        .expect(201);
      await expect(countActiveBranches(orgAId)).resolves.toBe(usageABefore);
    });

    it('B5: 2 request đồng thời đúng seat cuối cùng → CHỈ 1 thành công', async () => {
      const usage = await countActiveBranches(orgAId);
      const limit = usage + 1;
      await setLimit(orgAId, 'maxBranch', limit);
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/branches')
          .set('Authorization', `Bearer ${accessTokenA}`)
          .send({ name: 'B5 A' }),
        request(app.getHttpServer())
          .post('/api/v1/branches')
          .set('Authorization', `Bearer ${accessTokenA}`)
          .send({ name: 'B5 B' }),
      ]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);
      await expect(countActiveBranches(orgAId)).resolves.toBe(limit);
    });

    it('B6: usage đã vượt limit → create tiếp tục bị từ chối', async () => {
      const usage = await countActiveBranches(orgAId);
      await setLimit(orgAId, 'maxBranch', Math.max(usage - 1, 0));
      await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ name: 'Chi nhánh B6' })
        .expect(409);
    });

    it('B7: branch ARCHIVED giải phóng hạn mức — không còn tính vào usage. Không có endpoint unarchive/reactivate Branch (T053.05 Discovery — Architect Decision §8, chỉ CREATE cần bảo vệ)', async () => {
      await setLimit(orgAId, 'maxBranch', null);
      const created = await request(app.getHttpServer())
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ name: 'Chi nhánh B7' })
        .expect(201);
      const usageBeforeArchive = await countActiveBranches(orgAId);
      await request(app.getHttpServer())
        .post(`/api/v1/branches/${created.body.data.id}/archive`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(201);
      await expect(countActiveBranches(orgAId)).resolves.toBe(
        usageBeforeArchive - 1,
      );
    });
  });

  // =========================================================================
  // WAREHOUSE (create + restore — cùng khoá, cùng đếm deletedAt IS NULL)
  // =========================================================================
  describe('Warehouse quota — create', () => {
    it('W1: dưới hạn mức → tạo thành công', async () => {
      const usage = await countWarehouses(orgAId);
      await setLimit(orgAId, 'maxWarehouse', usage + 2);
      await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          branchId: branchAId,
          code: `W1-${uniqueSuffix()}`,
          name: 'Kho W1',
        })
        .expect(201);
    });

    it('W2: đúng bằng hạn mức → 409', async () => {
      const usage = await countWarehouses(orgAId);
      await setLimit(orgAId, 'maxWarehouse', usage);
      const res = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          branchId: branchAId,
          code: `W2-${uniqueSuffix()}`,
          name: 'Kho W2',
        })
        .expect(409);
      expect(res.body.code).toBe('SUBSCRIPTION_001');
    });

    it('W3: limit=null → không giới hạn', async () => {
      await setLimit(orgAId, 'maxWarehouse', null);
      await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          branchId: branchAId,
          code: `W3-${uniqueSuffix()}`,
          name: 'Kho W3',
        })
        .expect(201);
    });

    it('W4: warehouse của Org B không tính vào usage Org A', async () => {
      const usageABefore = await countWarehouses(orgAId);
      await setLimit(orgBId, 'maxWarehouse', null);
      await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessTokenB}`)
        .send({
          branchId: branchBId,
          code: `W4B-${uniqueSuffix()}`,
          name: 'Kho W4 Org B',
        })
        .expect(201);
      await expect(countWarehouses(orgAId)).resolves.toBe(usageABefore);
    });

    it('W5: 2 request đồng thời đúng seat cuối cùng → CHỈ 1 thành công', async () => {
      const usage = await countWarehouses(orgAId);
      const limit = usage + 1;
      await setLimit(orgAId, 'maxWarehouse', limit);
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/warehouses')
          .set('Authorization', `Bearer ${accessTokenA}`)
          .send({
            branchId: branchAId,
            code: `W5A-${uniqueSuffix()}`,
            name: 'W5 A',
          }),
        request(app.getHttpServer())
          .post('/api/v1/warehouses')
          .set('Authorization', `Bearer ${accessTokenA}`)
          .send({
            branchId: branchAId,
            code: `W5B-${uniqueSuffix()}`,
            name: 'W5 B',
          }),
      ]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);
      await expect(countWarehouses(orgAId)).resolves.toBe(limit);
    });

    it('W6: usage đã vượt limit → create tiếp tục bị từ chối', async () => {
      const usage = await countWarehouses(orgAId);
      await setLimit(orgAId, 'maxWarehouse', Math.max(usage - 1, 0));
      await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          branchId: branchAId,
          code: `W6-${uniqueSuffix()}`,
          name: 'Kho W6',
        })
        .expect(409);
    });

    it('W7: warehouse soft-delete giải phóng hạn mức', async () => {
      await setLimit(orgAId, 'maxWarehouse', null);
      const created = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          branchId: branchAId,
          code: `W7-${uniqueSuffix()}`,
          name: 'Kho W7',
        })
        .expect(201);
      const usageBeforeDelete = await countWarehouses(orgAId);
      await request(app.getHttpServer())
        .delete(`/api/v1/warehouses/${created.body.data.id}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(204);
      await expect(countWarehouses(orgAId)).resolves.toBe(
        usageBeforeDelete - 1,
      );
    });

    it('W8: T053.05A branchId/managerId tenant hardening vẫn còn hiệu lực (regression)', async () => {
      await setLimit(orgAId, 'maxWarehouse', null);
      const res = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          branchId: branchBId,
          code: `W8-${uniqueSuffix()}`,
          name: 'Kho W8 (tấn công)',
        })
        .expect(404);
      expect(res.body.code).toBe('BRANCH_001');
    });
  });

  describe('Warehouse quota — restore (quota-increasing, cùng khoá WAREHOUSE với create)', () => {
    it('W9: restore dưới hạn mức → thành công', async () => {
      await setLimit(orgAId, 'maxWarehouse', null);
      const created = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          branchId: branchAId,
          code: `W9-${uniqueSuffix()}`,
          name: 'Kho W9',
        })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/warehouses/${created.body.data.id}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(204);

      const usage = await countWarehouses(orgAId);
      await setLimit(orgAId, 'maxWarehouse', usage + 1);
      await request(app.getHttpServer())
        .post(`/api/v1/warehouses/${created.body.data.id}/restore`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(201);
    });

    it('W10: restore đúng bằng hạn mức → 409, deletedAt giữ nguyên', async () => {
      await setLimit(orgAId, 'maxWarehouse', null);
      const created = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          branchId: branchAId,
          code: `W10-${uniqueSuffix()}`,
          name: 'Kho W10',
        })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/warehouses/${created.body.data.id}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(204);

      const usage = await countWarehouses(orgAId);
      await setLimit(orgAId, 'maxWarehouse', usage);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/warehouses/${created.body.data.id}/restore`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(409);
      expect(res.body.code).toBe('SUBSCRIPTION_001');

      const stillDeleted = await prisma.warehouse.findUnique({
        where: { id: created.body.data.id },
      });
      expect(stillDeleted?.deletedAt).not.toBeNull();
    });

    it('W11: CREATE vs RESTORE đồng thời đúng seat cuối cùng → CHỈ 1 mutation tăng usage thành công, usage cuối = limit', async () => {
      await setLimit(orgAId, 'maxWarehouse', null);
      const toRestore = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          branchId: branchAId,
          code: `W11-DEL-${uniqueSuffix()}`,
          name: 'Kho W11 (sẽ xoá)',
        })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/warehouses/${toRestore.body.data.id}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(204);

      const usage = await countWarehouses(orgAId);
      const limit = usage + 1;
      await setLimit(orgAId, 'maxWarehouse', limit);

      const [createRes, restoreRes] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/warehouses')
          .set('Authorization', `Bearer ${accessTokenA}`)
          .send({
            branchId: branchAId,
            code: `W11-NEW-${uniqueSuffix()}`,
            name: 'Kho W11 (mới)',
          }),
        request(app.getHttpServer())
          .post(`/api/v1/warehouses/${toRestore.body.data.id}/restore`)
          .set('Authorization', `Bearer ${accessTokenA}`),
      ]);
      const statuses = [createRes.status, restoreRes.status].sort();
      expect(statuses).toEqual([201, 409]);
      await expect(countWarehouses(orgAId)).resolves.toBe(limit);
    });

    it('W12: restore đã vượt limit → tiếp tục bị từ chối', async () => {
      await setLimit(orgAId, 'maxWarehouse', null);
      const created = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          branchId: branchAId,
          code: `W12-${uniqueSuffix()}`,
          name: 'Kho W12',
        })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/warehouses/${created.body.data.id}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(204);

      const usage = await countWarehouses(orgAId);
      await setLimit(orgAId, 'maxWarehouse', Math.max(usage - 1, 0));
      await request(app.getHttpServer())
        .post(`/api/v1/warehouses/${created.body.data.id}/restore`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(409);
    });
  });

  // =========================================================================
  // PRODUCT (create + restore — mọi type tính 1 đơn vị, không trọng số)
  // =========================================================================
  describe('Product quota — create', () => {
    const priceOf = () => [{ type: 'RETAIL' as const, price: 100000 }];

    it('P1: dưới hạn mức → tạo thành công', async () => {
      const usage = await countProducts(orgAId);
      await setLimit(orgAId, 'maxProduct', usage + 2);
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          type: 'STANDARD',
          categoryId: categoryAId,
          unitId: unitAId,
          name: `SP P1 ${uniqueSuffix()}`,
          costPrice: 50000,
          prices: priceOf(),
        })
        .expect(201);
    });

    it('P2: đúng bằng hạn mức → 409', async () => {
      const usage = await countProducts(orgAId);
      await setLimit(orgAId, 'maxProduct', usage);
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          type: 'STANDARD',
          categoryId: categoryAId,
          unitId: unitAId,
          name: `SP P2 ${uniqueSuffix()}`,
          costPrice: 50000,
          prices: priceOf(),
        })
        .expect(409);
      expect(res.body.code).toBe('SUBSCRIPTION_001');
    });

    it('P3: limit=null → không giới hạn', async () => {
      await setLimit(orgAId, 'maxProduct', null);
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          type: 'STANDARD',
          categoryId: categoryAId,
          unitId: unitAId,
          name: `SP P3 ${uniqueSuffix()}`,
          costPrice: 50000,
          prices: priceOf(),
        })
        .expect(201);
    });

    it('P4: product của Org B không tính vào usage Org A', async () => {
      const usageABefore = await countProducts(orgAId);
      const catB = await prisma.category.upsert({
        where: {
          organizationId_code: { organizationId: orgBId, code: 'P4-CAT-B' },
        },
        create: {
          organizationId: orgBId,
          code: 'P4-CAT-B',
          name: 'P4 Cat B',
          slug: 'p4-cat-b',
        },
        update: {},
      });
      const unitB = await prisma.unit.upsert({
        where: {
          organizationId_code: { organizationId: orgBId, code: 'P4-UNIT-B' },
        },
        create: {
          organizationId: orgBId,
          code: 'P4-UNIT-B',
          name: 'Cái',
          symbol: 'cái',
        },
        update: {},
      });
      await setLimit(orgBId, 'maxProduct', null);
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessTokenB}`)
        .send({
          type: 'STANDARD',
          categoryId: catB.id,
          unitId: unitB.id,
          name: `SP P4B ${uniqueSuffix()}`,
          costPrice: 50000,
          prices: priceOf(),
        })
        .expect(201);
      await expect(countProducts(orgAId)).resolves.toBe(usageABefore);
    });

    it('P5: 2 request đồng thời đúng seat cuối cùng → CHỈ 1 thành công', async () => {
      const usage = await countProducts(orgAId);
      const limit = usage + 1;
      await setLimit(orgAId, 'maxProduct', limit);
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/products')
          .set('Authorization', `Bearer ${accessTokenA}`)
          .send({
            type: 'STANDARD',
            categoryId: categoryAId,
            unitId: unitAId,
            name: `SP P5A ${uniqueSuffix()}`,
            costPrice: 50000,
            prices: priceOf(),
          }),
        request(app.getHttpServer())
          .post('/api/v1/products')
          .set('Authorization', `Bearer ${accessTokenA}`)
          .send({
            type: 'STANDARD',
            categoryId: categoryAId,
            unitId: unitAId,
            name: `SP P5B ${uniqueSuffix()}`,
            costPrice: 50000,
            prices: priceOf(),
          }),
      ]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);
      await expect(countProducts(orgAId)).resolves.toBe(limit);
    });

    it('P6: usage đã vượt limit → create tiếp tục bị từ chối', async () => {
      const usage = await countProducts(orgAId);
      await setLimit(orgAId, 'maxProduct', Math.max(usage - 1, 0));
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          type: 'STANDARD',
          categoryId: categoryAId,
          unitId: unitAId,
          name: `SP P6 ${uniqueSuffix()}`,
          costPrice: 50000,
          prices: priceOf(),
        })
        .expect(409);
    });

    it('P7: STANDARD/SERVICE/VARIANT_PARENT/VARIANT_CHILD đều tính đúng 1 đơn vị mỗi dòng (không trọng số)', async () => {
      await setLimit(orgAId, 'maxProduct', null);
      const usageBefore = await countProducts(orgAId);

      const standard = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          type: 'STANDARD',
          categoryId: categoryAId,
          unitId: unitAId,
          name: `SP P7 STD ${uniqueSuffix()}`,
          costPrice: 50000,
          prices: priceOf(),
        })
        .expect(201);
      const service = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          type: 'SERVICE',
          categoryId: categoryAId,
          unitId: unitAId,
          name: `SP P7 SVC ${uniqueSuffix()}`,
          costPrice: 0,
          prices: priceOf(),
        })
        .expect(201);
      const parent = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          type: 'VARIANT_PARENT',
          categoryId: categoryAId,
          unitId: unitAId,
          name: `SP P7 PARENT ${uniqueSuffix()}`,
          costPrice: 50000,
          prices: priceOf(),
        })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          type: 'VARIANT_CHILD',
          categoryId: categoryAId,
          unitId: unitAId,
          parentProductId: parent.body.data.id,
          name: `SP P7 CHILD ${uniqueSuffix()}`,
          costPrice: 50000,
          prices: priceOf(),
        })
        .expect(201);

      void standard;
      void service;
      await expect(countProducts(orgAId)).resolves.toBe(usageBefore + 4);
    });

    it('P8: product đã xoá mềm (deletedAt khác null) không tính vào usage', async () => {
      await setLimit(orgAId, 'maxProduct', null);
      const created = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          type: 'STANDARD',
          categoryId: categoryAId,
          unitId: unitAId,
          name: `SP P8 ${uniqueSuffix()}`,
          costPrice: 50000,
          prices: priceOf(),
        })
        .expect(201);
      const usageBeforeDelete = await countProducts(orgAId);
      await request(app.getHttpServer())
        .delete(`/api/v1/products/${created.body.data.id}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(204);
      await expect(countProducts(orgAId)).resolves.toBe(usageBeforeDelete - 1);
    });
  });

  describe('Product quota — restore (quota-increasing, cùng khoá PRODUCT với create, giữ nguyên CAS/version)', () => {
    it('P9: restore dưới hạn mức → thành công', async () => {
      await setLimit(orgAId, 'maxProduct', null);
      const created = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          type: 'STANDARD',
          categoryId: categoryAId,
          unitId: unitAId,
          name: `SP P9 ${uniqueSuffix()}`,
          costPrice: 50000,
          prices: [{ type: 'RETAIL', price: 100000 }],
        })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/products/${created.body.data.id}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(204);

      const usage = await countProducts(orgAId);
      await setLimit(orgAId, 'maxProduct', usage + 1);
      await request(app.getHttpServer())
        .post(`/api/v1/products/${created.body.data.id}/restore`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(201);
    });

    it('P10: restore đúng bằng hạn mức → 409, deletedAt/status/version giữ nguyên', async () => {
      await setLimit(orgAId, 'maxProduct', null);
      const created = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          type: 'STANDARD',
          categoryId: categoryAId,
          unitId: unitAId,
          name: `SP P10 ${uniqueSuffix()}`,
          costPrice: 50000,
          prices: [{ type: 'RETAIL', price: 100000 }],
        })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/products/${created.body.data.id}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(204);
      const beforeReject = await prisma.product.findUniqueOrThrow({
        where: { id: created.body.data.id },
      });

      const usage = await countProducts(orgAId);
      await setLimit(orgAId, 'maxProduct', usage);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/products/${created.body.data.id}/restore`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(409);
      expect(res.body.code).toBe('SUBSCRIPTION_001');

      const afterReject = await prisma.product.findUniqueOrThrow({
        where: { id: created.body.data.id },
      });
      expect(afterReject.deletedAt).not.toBeNull();
      expect(afterReject.status).toBe(beforeReject.status);
      expect(afterReject.version).toBe(beforeReject.version);
    });

    it('P11: CREATE vs RESTORE đồng thời đúng seat cuối cùng → CHỈ 1 thành công', async () => {
      await setLimit(orgAId, 'maxProduct', null);
      const toRestore = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          type: 'STANDARD',
          categoryId: categoryAId,
          unitId: unitAId,
          name: `SP P11 DEL ${uniqueSuffix()}`,
          costPrice: 50000,
          prices: [{ type: 'RETAIL', price: 100000 }],
        })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/products/${toRestore.body.data.id}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(204);

      const usage = await countProducts(orgAId);
      const limit = usage + 1;
      await setLimit(orgAId, 'maxProduct', limit);

      const [createRes, restoreRes] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/products')
          .set('Authorization', `Bearer ${accessTokenA}`)
          .send({
            type: 'STANDARD',
            categoryId: categoryAId,
            unitId: unitAId,
            name: `SP P11 NEW ${uniqueSuffix()}`,
            costPrice: 50000,
            prices: [{ type: 'RETAIL', price: 100000 }],
          }),
        request(app.getHttpServer())
          .post(`/api/v1/products/${toRestore.body.data.id}/restore`)
          .set('Authorization', `Bearer ${accessTokenA}`),
      ]);
      const statuses = [createRes.status, restoreRes.status].sort();
      expect(statuses).toEqual([201, 409]);
      await expect(countProducts(orgAId)).resolves.toBe(limit);
    });

    it('P12: 2 RESTORE đồng thời đúng seat cuối cùng → CHỈ 1 thành công, usage cuối = limit', async () => {
      await setLimit(orgAId, 'maxProduct', null);
      const first = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          type: 'STANDARD',
          categoryId: categoryAId,
          unitId: unitAId,
          name: `SP P12 A ${uniqueSuffix()}`,
          costPrice: 50000,
          prices: [{ type: 'RETAIL', price: 100000 }],
        })
        .expect(201);
      const second = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          type: 'STANDARD',
          categoryId: categoryAId,
          unitId: unitAId,
          name: `SP P12 B ${uniqueSuffix()}`,
          costPrice: 50000,
          prices: [{ type: 'RETAIL', price: 100000 }],
        })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/products/${first.body.data.id}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(204);
      await request(app.getHttpServer())
        .delete(`/api/v1/products/${second.body.data.id}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(204);

      const usage = await countProducts(orgAId);
      const limit = usage + 1;
      await setLimit(orgAId, 'maxProduct', limit);

      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/products/${first.body.data.id}/restore`)
          .set('Authorization', `Bearer ${accessTokenA}`),
        request(app.getHttpServer())
          .post(`/api/v1/products/${second.body.data.id}/restore`)
          .set('Authorization', `Bearer ${accessTokenA}`),
      ]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);
      await expect(countProducts(orgAId)).resolves.toBe(limit);
    });

    it('P13: restore đã vượt limit → tiếp tục bị từ chối', async () => {
      await setLimit(orgAId, 'maxProduct', null);
      const created = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({
          type: 'STANDARD',
          categoryId: categoryAId,
          unitId: unitAId,
          name: `SP P13 ${uniqueSuffix()}`,
          costPrice: 50000,
          prices: [{ type: 'RETAIL', price: 100000 }],
        })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/products/${created.body.data.id}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(204);

      const usage = await countProducts(orgAId);
      await setLimit(orgAId, 'maxProduct', Math.max(usage - 1, 0));
      await request(app.getHttpServer())
        .post(`/api/v1/products/${created.body.data.id}/restore`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(409);
    });
  });

  // =========================================================================
  // CUSTOMER (create + restore)
  // =========================================================================
  describe('Customer quota — create', () => {
    it('C1: dưới hạn mức → tạo thành công', async () => {
      const usage = await countCustomers(orgAId);
      await setLimit(orgAId, 'maxCustomer', usage + 2);
      await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ fullName: `KH C1 ${uniqueSuffix()}` })
        .expect(201);
    });

    it('C2: đúng bằng hạn mức → 409', async () => {
      const usage = await countCustomers(orgAId);
      await setLimit(orgAId, 'maxCustomer', usage);
      const res = await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ fullName: `KH C2 ${uniqueSuffix()}` })
        .expect(409);
      expect(res.body.code).toBe('SUBSCRIPTION_001');
    });

    it('C3: limit=null → không giới hạn', async () => {
      await setLimit(orgAId, 'maxCustomer', null);
      await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ fullName: `KH C3 ${uniqueSuffix()}` })
        .expect(201);
    });

    it('C4: customer của Org B không tính vào usage Org A', async () => {
      const usageABefore = await countCustomers(orgAId);
      await setLimit(orgBId, 'maxCustomer', null);
      await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${accessTokenB}`)
        .send({ fullName: `KH C4B ${uniqueSuffix()}` })
        .expect(201);
      await expect(countCustomers(orgAId)).resolves.toBe(usageABefore);
    });

    it('C5: 2 request đồng thời đúng seat cuối cùng → CHỈ 1 thành công', async () => {
      const usage = await countCustomers(orgAId);
      const limit = usage + 1;
      await setLimit(orgAId, 'maxCustomer', limit);
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/customers')
          .set('Authorization', `Bearer ${accessTokenA}`)
          .send({ fullName: `KH C5A ${uniqueSuffix()}` }),
        request(app.getHttpServer())
          .post('/api/v1/customers')
          .set('Authorization', `Bearer ${accessTokenA}`)
          .send({ fullName: `KH C5B ${uniqueSuffix()}` }),
      ]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);
      await expect(countCustomers(orgAId)).resolves.toBe(limit);
    });

    it('C6: usage đã vượt limit → create tiếp tục bị từ chối', async () => {
      const usage = await countCustomers(orgAId);
      await setLimit(orgAId, 'maxCustomer', Math.max(usage - 1, 0));
      await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ fullName: `KH C6 ${uniqueSuffix()}` })
        .expect(409);
    });

    it('C7: customer INACTIVE vẫn tính vào maxCustomer', async () => {
      await setLimit(orgAId, 'maxCustomer', null);
      const created = await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ fullName: `KH C7 ${uniqueSuffix()}` })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/customers/${created.body.data.id}/deactivate`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ version: created.body.data.version })
        .expect(201);

      const usage = await countCustomers(orgAId);
      await setLimit(orgAId, 'maxCustomer', usage);
      const res = await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ fullName: `KH C7b ${uniqueSuffix()}` })
        .expect(409);
      expect(res.body.code).toBe('SUBSCRIPTION_001');
    });

    it('C8: customer đã xoá mềm không tính vào usage', async () => {
      await setLimit(orgAId, 'maxCustomer', null);
      const created = await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ fullName: `KH C8 ${uniqueSuffix()}` })
        .expect(201);
      const usageBeforeDelete = await countCustomers(orgAId);
      await request(app.getHttpServer())
        .delete(`/api/v1/customers/${created.body.data.id}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ version: created.body.data.version })
        .expect(204);
      await expect(countCustomers(orgAId)).resolves.toBe(usageBeforeDelete - 1);
    });
  });

  describe('Customer quota — restore (quota-increasing, cùng khoá CUSTOMER với create, giữ nguyên CAS/version)', () => {
    async function createAndDelete(name: string) {
      const created = await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ fullName: name })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/customers/${created.body.data.id}`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ version: created.body.data.version })
        .expect(204);
      const afterDelete = await prisma.customer.findUniqueOrThrow({
        where: { id: created.body.data.id },
      });
      return { id: created.body.data.id, version: afterDelete.version };
    }

    it('C9: restore dưới hạn mức → thành công', async () => {
      await setLimit(orgAId, 'maxCustomer', null);
      const deleted = await createAndDelete(`KH C9 ${uniqueSuffix()}`);

      const usage = await countCustomers(orgAId);
      await setLimit(orgAId, 'maxCustomer', usage + 1);
      await request(app.getHttpServer())
        .post(`/api/v1/customers/${deleted.id}/restore`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ version: deleted.version })
        .expect(201);
    });

    it('C10: restore đúng bằng hạn mức → 409', async () => {
      await setLimit(orgAId, 'maxCustomer', null);
      const deleted = await createAndDelete(`KH C10 ${uniqueSuffix()}`);

      const usage = await countCustomers(orgAId);
      await setLimit(orgAId, 'maxCustomer', usage);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/customers/${deleted.id}/restore`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ version: deleted.version })
        .expect(409);
      expect(res.body.code).toBe('SUBSCRIPTION_001');

      const stillDeleted = await prisma.customer.findUniqueOrThrow({
        where: { id: deleted.id },
      });
      expect(stillDeleted.deletedAt).not.toBeNull();
      expect(stillDeleted.version).toBe(deleted.version);
    });

    it('C11: CREATE vs RESTORE đồng thời đúng seat cuối cùng → CHỈ 1 thành công', async () => {
      await setLimit(orgAId, 'maxCustomer', null);
      const deleted = await createAndDelete(`KH C11 DEL ${uniqueSuffix()}`);

      const usage = await countCustomers(orgAId);
      const limit = usage + 1;
      await setLimit(orgAId, 'maxCustomer', limit);

      const [createRes, restoreRes] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/customers')
          .set('Authorization', `Bearer ${accessTokenA}`)
          .send({ fullName: `KH C11 NEW ${uniqueSuffix()}` }),
        request(app.getHttpServer())
          .post(`/api/v1/customers/${deleted.id}/restore`)
          .set('Authorization', `Bearer ${accessTokenA}`)
          .send({ version: deleted.version }),
      ]);
      const statuses = [createRes.status, restoreRes.status].sort();
      expect(statuses).toEqual([201, 409]);
      await expect(countCustomers(orgAId)).resolves.toBe(limit);
    });

    it('C12: rejection để lại đúng trạng thái deletedAt/status/version (không mutation từng phần)', async () => {
      await setLimit(orgAId, 'maxCustomer', null);
      const deleted = await createAndDelete(`KH C12 ${uniqueSuffix()}`);
      const beforeReject = await prisma.customer.findUniqueOrThrow({
        where: { id: deleted.id },
      });

      const usage = await countCustomers(orgAId);
      await setLimit(orgAId, 'maxCustomer', usage);
      await request(app.getHttpServer())
        .post(`/api/v1/customers/${deleted.id}/restore`)
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ version: deleted.version })
        .expect(409);

      const afterReject = await prisma.customer.findUniqueOrThrow({
        where: { id: deleted.id },
      });
      expect(afterReject.deletedAt?.getTime()).toBe(
        beforeReject.deletedAt?.getTime(),
      );
      expect(afterReject.status).toBe(beforeReject.status);
      expect(afterReject.version).toBe(beforeReject.version);
    });
  });

  // =========================================================================
  // GLOBAL
  // =========================================================================
  describe('Global', () => {
    it('G1: Platform Admin KHÔNG bypass hạn mức trên route tenant CREATE thông thường', async () => {
      const passwordHash = await argon2.hash('E2ePass@123', {
        type: argon2.argon2id,
      });
      const platformAdmin = await prisma.user.upsert({
        where: {
          organizationId_email: {
            organizationId: orgAId,
            email: 'g1-platform-admin@pos-erp.local',
          },
        },
        create: {
          organizationId: orgAId,
          username: 'g1-platform-admin',
          email: 'g1-platform-admin@pos-erp.local',
          passwordHash,
          isPlatformAdmin: true,
        },
        update: { isPlatformAdmin: true },
      });
      const role = await prisma.role.findFirstOrThrow({
        where: { organizationId: orgAId, code: 'usage_limit_e2e_role' },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: platformAdmin.id, roleId: role.id } },
        create: { userId: platformAdmin.id, roleId: role.id },
        update: {},
      });
      const permissions = await prisma.permission.findMany();
      const platformAdminToken = app.get(JwtService).sign({
        sub: platformAdmin.id,
        organizationId: orgAId,
        branchId: null,
        email: platformAdmin.email,
        permissions: permissions.map((p) => p.code),
        permissionVersion: platformAdmin.permissionVersion,
        isPlatformAdmin: true,
      });

      const usage = await countUsers(orgAId);
      await setLimit(orgAId, 'maxUser', usage);
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({
          username: `g1-${uniqueSuffix()}`,
          email: `g1-${uniqueSuffix()}@acme.test`,
          password: 'SuperSecret123',
        })
        .expect(409);
      expect(res.body.code).toBe('SUBSCRIPTION_001');
    });

    it('G2/G3: TRIAL signup vẫn thành công (bootstrap KHÔNG bị quota chặn) và có đúng hạn mức chính tắc', async () => {
      const email = `g2-${uniqueSuffix()}@trial-e2e.local`;

      // Spy PHẢI gắn TRƯỚC request-otp — MailProcessor xử lý job BullMQ bất đồng bộ, có thể log
      // OTP trước khi dòng code sau `await request(...)` kịp chạy nếu gắn spy sau (cùng pattern
      // `captureOtpFromConsole()` trong trial-signup.e2e-spec.ts).
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      await request(app.getHttpServer())
        .post('/api/v1/trial-signup/request-otp')
        .send({ email })
        .expect(204);

      let otp: string | undefined;
      for (let attempt = 0; attempt < 30 && !otp; attempt += 1) {
        const match = warnSpy.mock.calls
          .map((args) => String(args[0]))
          .find((m) => m.includes(email) && m.includes('otp='))
          ?.match(/otp=(\d{6})/);
        if (match) otp = match[1];
        else await new Promise((resolve) => setTimeout(resolve, 200));
      }
      warnSpy.mockRestore();
      if (!otp) {
        throw new Error('Không tìm thấy OTP cho G2/G3 sau khi chờ ~6s');
      }

      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/trial-signup/verify-otp')
        .send({ email, otp })
        .expect(200);
      const { signupProofToken } = verifyRes.body.data;

      const finalizeRes = await request(app.getHttpServer())
        .post('/api/v1/trial-signup')
        .send({
          signupProofToken,
          organization: { displayName: `G2 Trial ${uniqueSuffix()}` },
          owner: { fullName: 'G2 Owner', password: 'SuperSecret123' },
        })
        .expect(201);

      const newOrgId = finalizeRes.body.data.userInfo.organizationId;
      const subscription =
        await prisma.organizationSubscription.findUniqueOrThrow({
          where: { organizationId: newOrgId },
        });
      expect(subscription.plan).toBe('TRIAL');
      expect(subscription.maxUser).toBe(3);
      expect(subscription.maxBranch).toBe(1);
      expect(subscription.maxWarehouse).toBe(1);
      expect(subscription.maxProduct).toBe(50);
      expect(subscription.maxCustomer).toBe(50);
    });

    it('G4: FREE (null/unlimited) vẫn hoạt động — Platform Admin provisioning không đặt plan vẫn tạo Organization dùng được ngay', async () => {
      const orgFree = await prisma.organization.upsert({
        where: { slug: 'usage-limit-e2e-free-org' },
        create: {
          code: 'USAGE-LIMIT-FREE',
          displayName: 'Usage Limit Free Org',
          slug: 'usage-limit-e2e-free-org',
        },
        update: {},
      });
      await prisma.organizationSubscription.upsert({
        where: { organizationId: orgFree.id },
        create: { organizationId: orgFree.id },
        update: {},
      });
      const subscription =
        await prisma.organizationSubscription.findUniqueOrThrow({
          where: { organizationId: orgFree.id },
        });
      expect(subscription.plan).toBe('FREE');
      expect(subscription.maxUser).toBeNull();
      expect(subscription.maxBranch).toBeNull();
      expect(subscription.maxWarehouse).toBeNull();
      expect(subscription.maxProduct).toBeNull();
      expect(subscription.maxCustomer).toBeNull();
    });

    it('G5: ENTERPRISE (null/unlimited) vẫn hoạt động', async () => {
      const orgEnterprise = await prisma.organization.upsert({
        where: { slug: 'usage-limit-e2e-enterprise-org' },
        create: {
          code: 'USAGE-LIMIT-ENT',
          displayName: 'Usage Limit Enterprise Org',
          slug: 'usage-limit-e2e-enterprise-org',
        },
        update: {},
      });
      await prisma.organizationSubscription.upsert({
        where: { organizationId: orgEnterprise.id },
        create: { organizationId: orgEnterprise.id, plan: 'ENTERPRISE' },
        update: { plan: 'ENTERPRISE' },
      });
      const subscription =
        await prisma.organizationSubscription.findUniqueOrThrow({
          where: { organizationId: orgEnterprise.id },
        });
      expect(subscription.plan).toBe('ENTERPRISE');
      expect(subscription.maxUser).toBeNull();
      expect(subscription.maxProduct).toBeNull();
    });

    it('G6: tổ chức "downgrade" (usage đã vượt limit) giữ nguyên dữ liệu hiện có, chỉ CREATE tiếp theo bị chặn', async () => {
      await setLimit(orgAId, 'maxCustomer', null);
      await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ fullName: `KH G6 ${uniqueSuffix()}` })
        .expect(201);
      const usageBefore = await countCustomers(orgAId);
      await setLimit(orgAId, 'maxCustomer', Math.max(usageBefore - 3, 0));

      await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ fullName: `KH G6b ${uniqueSuffix()}` })
        .expect(409);

      await expect(countCustomers(orgAId)).resolves.toBe(usageBefore);
    });

    it('G7: quota check thất bại → KHÔNG ghi gì cả (đã chứng minh xuyên suốt U2/B2/W2/P2/C2 — tổng hợp lại 1 lần cho Customer)', async () => {
      const usage = await countCustomers(orgAId);
      await setLimit(orgAId, 'maxCustomer', usage);
      const code = `G7-${uniqueSuffix()}`;
      await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .send({ fullName: code })
        .expect(409);
      const found = await prisma.customer.findFirst({
        where: { fullName: code },
      });
      expect(found).toBeNull();
    });

    it('G8: 2 Organization khác nhau — request đồng thời không serialize/không ảnh hưởng lẫn nhau', async () => {
      const usageA = await countCustomers(orgAId);
      const usageB = await countCustomers(orgBId);
      await setLimit(orgAId, 'maxCustomer', usageA + 1);
      await setLimit(orgBId, 'maxCustomer', usageB + 1);

      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/customers')
          .set('Authorization', `Bearer ${accessTokenA}`)
          .send({ fullName: `KH G8A ${uniqueSuffix()}` }),
        request(app.getHttpServer())
          .post('/api/v1/customers')
          .set('Authorization', `Bearer ${accessTokenB}`)
          .send({ fullName: `KH G8B ${uniqueSuffix()}` }),
      ]);
      expect(resA.status).toBe(201);
      expect(resB.status).toBe(201);
      await expect(countCustomers(orgAId)).resolves.toBe(usageA + 1);
      await expect(countCustomers(orgBId)).resolves.toBe(usageB + 1);
    });

    it('G9: cùng 1 Organization — resourceType khác nhau (User vs Customer) không khoá lẫn nhau (độc lập)', async () => {
      const usageUser = await countUsers(orgAId);
      const usageCustomer = await countCustomers(orgAId);
      await setLimit(orgAId, 'maxUser', usageUser + 1);
      await setLimit(orgAId, 'maxCustomer', usageCustomer + 1);

      const [userRes, customerRes] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/users')
          .set('Authorization', `Bearer ${accessTokenA}`)
          .send({
            username: `g9-${uniqueSuffix()}`,
            email: `g9-${uniqueSuffix()}@acme.test`,
            password: 'SuperSecret123',
          }),
        request(app.getHttpServer())
          .post('/api/v1/customers')
          .set('Authorization', `Bearer ${accessTokenA}`)
          .send({ fullName: `KH G9 ${uniqueSuffix()}` }),
      ]);
      expect(userRes.status).toBe(201);
      expect(customerRes.status).toBe(201);
    });
  });
});
