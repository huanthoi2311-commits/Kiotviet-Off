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
 * Integration Test — Warehouse CRUD + restore + block-delete-khi-có-tồn-kho/giao-dịch
 * với Postgres thật (Prompt 021). Cùng giới hạn với các *.e2e-spec.ts trước: KHÔNG tự
 * chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- warehouse.e2e-spec.ts
 */
describe('Warehouse Module (e2e, integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let accessToken: string;
  let organizationId: string;
  let branchId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.upsert({
      where: { slug: 'warehouse-e2e' },
      create: {
        code: 'WAREHOUSE-E2E',
        displayName: 'Warehouse E2E Org',
        slug: 'warehouse-e2e',
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
        organizationId_code: { organizationId, code: 'warehouse_e2e_role' },
      },
      create: {
        organizationId,
        code: 'warehouse_e2e_role',
        name: 'Warehouse E2E Role',
      },
      update: {},
    });

    const warehousePermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'warehouse:' } },
    });
    const productPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'product:' } },
    });
    const allPermissions = [...warehousePermissions, ...productPermissions];
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
          email: 'warehouse-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'warehouse-e2e',
        email: 'warehouse-e2e@pos-erp.local',
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
      where: { organizationId_code: { organizationId, code: 'E2E-BRANCH' } },
      create: { organizationId, code: 'E2E-BRANCH', name: 'Chi nhánh E2E' },
      update: {},
    });
    branchId = branch.id;

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
    app = await createE2eApp(moduleFixture);

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
        type: 'STANDARD',
        categoryId: category.id,
        unitId: unit.id,
        name: `Sản phẩm warehouse e2e ${Date.now()}`,
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

  it('tạo, tìm kiếm và lấy chi tiết kho', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        code: `KHO-${Date.now()}`,
        name: 'Kho Chính Hà Nội',
        type: 'MAIN',
      })
      .expect(201);
    expect(created.body.data.status).toBe('ACTIVE');

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .query({ search: 'Kho Chính' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      listRes.body.data.items.some(
        (w: { id: string }) => w.id === created.body.data.id,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .get(`/api/v1/warehouses/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('DUPLICATE: từ chối tạo trùng code trong cùng tổ chức', async () => {
    const code = `DUP-${Date.now()}`;
    await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, code, name: 'Kho gốc' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, code, name: 'Kho trùng' })
      .expect(409);
  });

  it('BRANCH-NOT-FOUND: từ chối tạo kho với branchId không tồn tại (T053.05A — 404 BRANCH_001, xác minh TRƯỚC khi ghi, không còn dựa vào FK Prisma)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId: '00000000-0000-4000-8000-000000000000',
        code: `NOBRANCH-${Date.now()}`,
        name: 'Kho không có chi nhánh',
      })
      .expect(404);
    expect(res.body.code).toBe('BRANCH_001');
  });

  it('BLOCK-DELETE: từ chối xóa kho đang có tồn kho', async () => {
    const warehouseRes = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, code: `STOCK-${Date.now()}`, name: 'Kho có tồn kho' })
      .expect(201);

    await prisma.inventory.create({
      data: {
        organizationId,
        warehouseId: warehouseRes.body.data.id,
        productId,
        quantity: 10,
      },
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/warehouses/${warehouseRes.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(422);
  });

  it('cập nhật, xóa mềm và khôi phục kho không có tồn kho hoạt động bình thường', async () => {
    const warehouseRes = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, code: `LIFECYCLE-${Date.now()}`, name: 'Kho vòng đời' })
      .expect(201);
    const id = warehouseRes.body.data.id;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/warehouses/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Kho vòng đời (đã sửa)' })
      .expect(200);
    expect(updated.body.data.name).toBe('Kho vòng đời (đã sửa)');

    await request(app.getHttpServer())
      .delete(`/api/v1/warehouses/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/warehouses/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/warehouses/${id}/restore`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/warehouses/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  describe('T053.05A — branchId/managerId tenant-isolation (Org A vs Org B, real Postgres)', () => {
    let orgBId: string;
    let orgBBranchId: string;
    let orgBUserId: string;

    beforeAll(async () => {
      const orgB = await prisma.organization.upsert({
        where: { slug: 'warehouse-e2e-org-b' },
        create: {
          code: 'WAREHOUSE-E2E-ORG-B',
          displayName: 'Warehouse E2E Org B',
          slug: 'warehouse-e2e-org-b',
        },
        update: {},
      });
      orgBId = orgB.id;

      const branchB = await prisma.branch.upsert({
        where: {
          organizationId_code: { organizationId: orgBId, code: 'E2E-BRANCH-B' },
        },
        create: {
          organizationId: orgBId,
          code: 'E2E-BRANCH-B',
          name: 'Chi nhánh E2E Org B',
        },
        update: {},
      });
      orgBBranchId = branchB.id;

      const passwordHashB = await argon2.hash('E2ePass@123', {
        type: argon2.argon2id,
      });
      const userB = await prisma.user.upsert({
        where: {
          organizationId_email: {
            organizationId: orgBId,
            email: 'warehouse-e2e-org-b@pos-erp.local',
          },
        },
        create: {
          organizationId: orgBId,
          username: 'warehouse-e2e-org-b',
          email: 'warehouse-e2e-org-b@pos-erp.local',
          passwordHash: passwordHashB,
        },
        update: {},
      });
      orgBUserId = userB.id;
    });

    it('E1: Org A + Branch A + User A (manager) → tạo kho thành công', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          branchId,
          code: `E1-${Date.now()}`,
          name: 'Kho E1',
        })
        .expect(201);
      expect(res.body.data.branchId).toBe(branchId);
    });

    it('E2: Org A actor + Branch B (org khác) → 404 BRANCH_001, KHÔNG có Warehouse nào mang quan hệ bất khả thi được tạo', async () => {
      const code = `E2-${Date.now()}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ branchId: orgBBranchId, code, name: 'Kho E2 (tấn công)' })
        .expect(404);
      expect(res.body.code).toBe('BRANCH_001');

      const impossible = await prisma.warehouse.findFirst({
        where: { organizationId, branchId: orgBBranchId },
      });
      expect(impossible).toBeNull();
      const byCode = await prisma.warehouse.findFirst({ where: { code } });
      expect(byCode).toBeNull();
    });

    it('E3: Org A actor + User B (org khác) làm manager → 404 USER_001, KHÔNG có Warehouse nào mang quan hệ bất khả thi được tạo', async () => {
      const code = `E3-${Date.now()}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          branchId,
          managerId: orgBUserId,
          code,
          name: 'Kho E3 (tấn công)',
        })
        .expect(404);
      expect(res.body.code).toBe('USER_001');

      const impossible = await prisma.warehouse.findFirst({
        where: { organizationId, managerId: orgBUserId },
      });
      expect(impossible).toBeNull();
      const byCode = await prisma.warehouse.findFirst({ where: { code } });
      expect(byCode).toBeNull();
    });

    it('E4: branchId không tồn tại → CÙNG 404 BRANCH_001 như E2 (non-disclosing)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          branchId: '00000000-0000-4000-8000-000000000001',
          code: `E4-${Date.now()}`,
          name: 'Kho E4',
        })
        .expect(404);
      expect(res.body.code).toBe('BRANCH_001');
    });

    it('E5: managerId không tồn tại → CÙNG 404 USER_001 như E3 (non-disclosing)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          branchId,
          managerId: '00000000-0000-4000-8000-000000000002',
          code: `E5-${Date.now()}`,
          name: 'Kho E5',
        })
        .expect(404);
      expect(res.body.code).toBe('USER_001');
    });

    it('E6: Warehouse hiện có của Org A KHÔNG thể bị UPDATE branchId sang Branch B', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ branchId, code: `E6-${Date.now()}`, name: 'Kho E6' })
        .expect(201);
      const id = created.body.data.id;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/warehouses/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ branchId: orgBBranchId })
        .expect(404);
      expect(res.body.code).toBe('BRANCH_001');

      const stillOrgABranch = await prisma.warehouse.findUnique({
        where: { id },
      });
      expect(stillOrgABranch?.branchId).toBe(branchId);
    });

    it('E7: Warehouse hiện có của Org A KHÔNG thể bị UPDATE managerId sang User B', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ branchId, code: `E7-${Date.now()}`, name: 'Kho E7' })
        .expect(201);
      const id = created.body.data.id;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/warehouses/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ managerId: orgBUserId })
        .expect(404);
      expect(res.body.code).toBe('USER_001');

      const stillNoManager = await prisma.warehouse.findUnique({
        where: { id },
      });
      expect(stillNoManager?.managerId).toBeNull();
    });

    it('E8: managerId = null xoá manager hợp lệ (không cần tra User)', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          branchId,
          managerId: undefined,
          code: `E8-${Date.now()}`,
          name: 'Kho E8',
        })
        .expect(201);
      const id = created.body.data.id;

      // Gán manager hợp lệ (cùng tổ chức) trước, rồi xoá bằng null.
      await prisma.warehouse.update({
        where: { id },
        data: { managerId: null },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/warehouses/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ managerId: null })
        .expect(200);
      expect(res.body.data.managerId).toBeNull();
    });

    it('E9: sau toàn bộ tấn công bị từ chối, trạng thái Org B (Branch/User/Warehouse) không đổi', async () => {
      const branchBAfter = await prisma.branch.findUnique({
        where: { id: orgBBranchId },
      });
      expect(branchBAfter).not.toBeNull();
      expect(branchBAfter?.organizationId).toBe(orgBId);

      const userBAfter = await prisma.user.findUnique({
        where: { id: orgBUserId },
      });
      expect(userBAfter).not.toBeNull();
      expect(userBAfter?.organizationId).toBe(orgBId);

      const orgBWarehouseCount = await prisma.warehouse.count({
        where: { organizationId: orgBId },
      });
      expect(orgBWarehouseCount).toBe(0);
    });
  });
});
