import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './helpers/create-e2e-app';
import { AppModule } from '../src/app.module';
import { PERMISSION_CATALOG } from '../src/modules/rbac/infrastructure/permission-catalog';

/** Mirrors backend's ExceljsSupplierExcelAdapter's expected columns (Mã NCC/Tên công ty). */
async function buildValidSupplierImportWorkbook(code: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Suppliers');
  worksheet.columns = [
    { header: 'Mã NCC', key: 'code' },
    { header: 'Tên công ty', key: 'companyName' },
  ];
  worksheet.addRow({ code, companyName: `Nhà cung cấp ${code}` });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Integration Test — T053.03 Feature Entitlements Foundation (real Postgres, CASE 1-10 theo Architect
 * Authorization §19). KHÔNG tự chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- entitlement.e2e-spec.ts
 */
describe('Entitlement Module (e2e, integration) — T053.03 CASE 1-10', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  let platformAdminToken: string;
  let allPermissionCodes: string[];

  async function createOrgWithPlan(
    plan: 'FREE' | 'TRIAL' | 'BASIC' | 'PRO' | 'ENTERPRISE' | undefined,
    slugPrefix: string,
  ) {
    const unique = `${slugPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ownerEmail = `${unique}-owner@e2e.local`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        organization: { displayName: unique, slug: unique },
        owner: {
          fullName: 'Owner E2E',
          email: ownerEmail,
          password: 'Password123',
        },
        ...(plan ? { subscription: { plan } } : {}),
      })
      .expect(201);
    const orgId: string = res.body.data.id;
    const ownerUser = await prisma.user.findFirstOrThrow({
      where: { organizationId: orgId, email: ownerEmail },
    });
    // Owner Role = TOÀN QUYỀN (T053.01 audit) — token dùng toàn bộ permission catalog để cô lập
    // biến số: nếu bị 403, chỉ có thể do Entitlement, không phải do thiếu RBAC permission.
    const ownerToken = jwtService.sign({
      sub: ownerUser.id,
      organizationId: orgId,
      branchId: null,
      email: ownerUser.email,
      permissions: allPermissionCodes,
      permissionVersion: ownerUser.permissionVersion,
      isPlatformAdmin: false,
    });
    return { orgId, ownerToken, ownerUserId: ownerUser.id, unique };
  }

  /** User có Role KHÔNG permission nào — dùng để chứng minh RBAC vẫn áp dụng độc lập sau Entitlement. */
  async function createNoPermissionUser(orgId: string, unique: string) {
    const role = await prisma.role.create({
      data: {
        organizationId: orgId,
        code: `no_perm_${unique.replace(/[^a-z0-9]/gi, '').slice(0, 20)}`,
        name: 'No Permission Role',
      },
    });
    const passwordHash = await argon2.hash('Password123', {
      type: argon2.argon2id,
    });
    const user = await prisma.user.create({
      data: {
        organizationId: orgId,
        username: `noperm-${unique.replace(/[^a-z0-9]/gi, '').slice(0, 20)}`,
        email: `noperm-${unique}@e2e.local`,
        passwordHash,
      },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
    const token = jwtService.sign({
      sub: user.id,
      organizationId: orgId,
      branchId: null,
      email: user.email,
      permissions: [],
      permissionVersion: user.permissionVersion,
      isPlatformAdmin: false,
    });
    return token;
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
    allPermissionCodes = (await prisma.permission.findMany()).map(
      (p) => p.code,
    );

    const bootstrapOrg = await prisma.organization.upsert({
      where: { slug: 'org-e2e-entitlement-bootstrap' },
      create: {
        code: 'ORG-E2E-ENT-BOOT',
        displayName: 'Bootstrap Org Entitlement E2E',
        slug: 'org-e2e-entitlement-bootstrap',
      },
      update: {},
    });
    const passwordHash = await argon2.hash('E2ePass@123', {
      type: argon2.argon2id,
    });
    const platformAdmin = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId: bootstrapOrg.id,
          email: 'platform-admin-entitlement-e2e@pos-erp.local',
        },
      },
      create: {
        organizationId: bootstrapOrg.id,
        username: 'platform-admin-entitlement-e2e',
        email: 'platform-admin-entitlement-e2e@pos-erp.local',
        passwordHash,
        isPlatformAdmin: true,
      },
      update: { isPlatformAdmin: true },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await createE2eApp(moduleFixture);
    jwtService = app.get(JwtService);

    // permissions: toàn bộ catalog — mô phỏng platform admin thật (qua initializeFirstAdmin) luôn
    // có Role riêng trong Organization bootstrap của họ; test PLATFORM ADMIN bypass bên dưới cần
    // tách biệt hoàn toàn biến số RBAC để chỉ còn Entitlement là điều kiện đang được chứng minh.
    platformAdminToken = jwtService.sign({
      sub: platformAdmin.id,
      organizationId: bootstrapOrg.id,
      branchId: null,
      email: platformAdmin.email,
      permissions: allPermissionCodes,
      permissionVersion: platformAdmin.permissionVersion,
      isPlatformAdmin: true,
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('CASE 1: FREE tenant attempts USER_MANAGEMENT → entitlement rejection (403, ENTITLEMENT_001)', async () => {
    const { ownerToken } = await createOrgWithPlan('FREE', 'case1-free');
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        username: 'newuser1',
        email: `newuser1-${Date.now()}@e2e.local`,
        password: 'Password123',
      })
      .expect(403);
    expect(res.body.code).toBe('ENTITLEMENT_001');
  });

  it('CASE 2: TRIAL tenant uses USER_MANAGEMENT → entitlement allows, RBAC then applies normally', async () => {
    const { ownerToken, orgId, unique } = await createOrgWithPlan(
      'TRIAL',
      'case2-trial',
    );
    // Owner (toàn quyền) → entitlement + RBAC đều pass → 201.
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        username: 'newuser2',
        email: `newuser2-${Date.now()}@e2e.local`,
        password: 'Password123',
      })
      .expect(201);

    // User KHÔNG permission trong CÙNG org TRIAL → entitlement pass nhưng RBAC vẫn chặn độc lập —
    // chứng minh 2 tầng tách biệt (T053.03 §3 Required access invariant).
    const noPermToken = await createNoPermissionUser(orgId, unique);
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${noPermToken}`)
      .send({
        username: 'newuser2b',
        email: `newuser2b-${Date.now()}@e2e.local`,
        password: 'Password123',
      })
      .expect(403);
    expect(res.body.code).toBe('RBAC_004');
  });

  it('CASE 3: BASIC tenant attempts RBAC_MANAGEMENT → entitlement rejection (403, ENTITLEMENT_001)', async () => {
    const { ownerToken } = await createOrgWithPlan('BASIC', 'case3-basic');
    const res = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: `role_${Date.now()}`, name: 'Test Role' })
      .expect(403);
    expect(res.body.code).toBe('ENTITLEMENT_001');
  });

  it('CASE 4: PRO tenant uses RBAC_MANAGEMENT → allowed subject to RBAC', async () => {
    const { ownerToken } = await createOrgWithPlan('PRO', 'case4-pro');
    await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: `role_${Date.now()}`, name: 'Test Role' })
      .expect(201);
  });

  it('CASE 5: ENTERPRISE tenant uses representative entitled feature (SUPPLIER) → allowed', async () => {
    const { ownerToken } = await createOrgWithPlan(
      'ENTERPRISE',
      'case5-enterprise',
    );
    await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ companyName: 'Công ty E2E Enterprise' })
      .expect(201);
  });

  it('CASE 6: cùng endpoint, 2 Organization plan khác nhau → kết quả độc lập', async () => {
    const free = await createOrgWithPlan('FREE', 'case6-free');
    const trial = await createOrgWithPlan('TRIAL', 'case6-trial');

    const freeRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${free.ownerToken}`)
      .send({
        username: 'case6free',
        email: `case6free-${Date.now()}@e2e.local`,
        password: 'Password123',
      })
      .expect(403);
    expect(freeRes.body.code).toBe('ENTITLEMENT_001');

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${trial.ownerToken}`)
      .send({
        username: 'case6trial',
        email: `case6trial-${Date.now()}@e2e.local`,
        password: 'Password123',
      })
      .expect(201);
  });

  it('CASE 7: override true bật feature vốn bị Plan tắt (BASIC + RBAC_MANAGEMENT override true)', async () => {
    const { ownerToken, orgId } = await createOrgWithPlan(
      'BASIC',
      'case7-basic-override',
    );
    await prisma.organizationSubscription.update({
      where: { organizationId: orgId },
      data: { entitlementOverrides: { RBAC_MANAGEMENT: true } },
    });
    await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: `role_${Date.now()}`, name: 'Test Role' })
      .expect(201);
  });

  it('CASE 8: override false tắt feature vốn Plan bật (TRIAL + USER_MANAGEMENT override false)', async () => {
    const { ownerToken, orgId } = await createOrgWithPlan(
      'TRIAL',
      'case8-trial-override',
    );
    await prisma.organizationSubscription.update({
      where: { organizationId: orgId },
      data: { entitlementOverrides: { USER_MANAGEMENT: false } },
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        username: 'case8user',
        email: `case8user-${Date.now()}@e2e.local`,
        password: 'Password123',
      })
      .expect(403);
    expect(res.body.code).toBe('ENTITLEMENT_001');
  });

  it('CASE 9: cross-tenant isolation — override của Org A không áp dụng cho Org B', async () => {
    const orgA = await createOrgWithPlan('BASIC', 'case9-org-a');
    const orgB = await createOrgWithPlan('BASIC', 'case9-org-b');
    await prisma.organizationSubscription.update({
      where: { organizationId: orgA.orgId },
      data: { entitlementOverrides: { RBAC_MANAGEMENT: true } },
    });

    await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${orgA.ownerToken}`)
      .send({ code: `role_${Date.now()}`, name: 'Org A Role' })
      .expect(201);

    const resB = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${orgB.ownerToken}`)
      .send({ code: `role_${Date.now()}`, name: 'Org B Role' })
      .expect(403);
    expect(resB.body.code).toBe('ENTITLEMENT_001');
  });

  it('CASE 10: subscription missing/corrupt → fail safely, KHÔNG âm thầm coi như ENTERPRISE', async () => {
    const { ownerToken, orgId } = await createOrgWithPlan(
      'ENTERPRISE',
      'case10-missing-sub',
    );
    // Xác nhận trước khi xoá: ENTERPRISE thật sự cho phép (bằng chứng baseline).
    await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ companyName: 'Baseline Before Delete' })
      .expect(201);

    await prisma.organizationSubscription.delete({
      where: { organizationId: orgId },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        username: 'case10user',
        email: `case10user-${Date.now()}@e2e.local`,
        password: 'Password123',
      })
      .expect(403);
    expect(res.body.code).toBe('ENTITLEMENT_001');
  });

  // T053.03 Architect Decision (Conflict Resolution §8) — bổ sung tường minh 2 case SUPPLIER để
  // legacy fixture (nay đã chuyển ENTERPRISE trong supplier.e2e-spec.ts) không vô tình che giấu
  // một entitlement enforcement bị hỏng: FREE+SUPPLIER PHẢI bị từ chối, BASIC+SUPPLIER PHẢI được
  // phép — độc lập với bất kỳ fixture ENTERPRISE nào khác trong repo.
  it('CASE 11: FREE tenant attempts SUPPLIER → entitlement rejection', async () => {
    const { ownerToken } = await createOrgWithPlan('FREE', 'case11-free');
    const res = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ companyName: 'Case 11 Free Blocked' })
      .expect(403);
    expect(res.body.code).toBe('ENTITLEMENT_001');
  });

  it('CASE 12: BASIC tenant uses SUPPLIER → allowed subject to normal authorization/business rules', async () => {
    const { ownerToken } = await createOrgWithPlan('BASIC', 'case12-basic');
    await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ companyName: 'Case 12 Basic Allowed' })
      .expect(201);
  });

  // T053.06C — POST /suppliers/import trước đây KHÔNG mang @RequireEntitlement('SUPPLIER')
  // (SupplierController.create() có, import() thì không) — EntitlementGuard mặc định cho qua khi
  // thiếu metadata (hành vi ĐÚNG cho route không cần entitlement, nhưng import Supplier THÌ CẦN,
  // giống hệt create()) — kết quả: tenant FREE (không có SUPPLIER) từng tạo được Supplier không
  // giới hạn qua đường Import dù bị chặn đúng ở đường Create. CASE 13/14 chứng minh đã đóng lỗ hổng
  // này, dùng ĐÚNG các helper/fixture đã có (createOrgWithPlan), không dựng hạ tầng test mới.
  it('CASE 13: FREE tenant KHÔNG có SUPPLIER → POST /suppliers/import bị từ chối 403 ENTITLEMENT_001, KHÔNG ghi Supplier nào, KHÔNG ghi audit "supplier.import"', async () => {
    const { ownerToken, orgId } = await createOrgWithPlan(
      'FREE',
      'case13-free-import',
    );
    const importCode = `CASE13-${Date.now()}`;
    const workbook = await buildValidSupplierImportWorkbook(importCode);

    const beforeSupplierCount = await prisma.supplier.count({
      where: { organizationId: orgId },
    });
    const beforeAuditCount = await prisma.auditLog.count({
      where: { organizationId: orgId, action: 'supplier.import' },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/suppliers/import')
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', workbook, 'suppliers.xlsx')
      .expect(403);
    expect(res.body.code).toBe('ENTITLEMENT_001');

    const afterSupplierCount = await prisma.supplier.count({
      where: { organizationId: orgId },
    });
    expect(afterSupplierCount).toBe(beforeSupplierCount);

    const afterAuditCount = await prisma.auditLog.count({
      where: { organizationId: orgId, action: 'supplier.import' },
    });
    expect(afterAuditCount).toBe(beforeAuditCount);

    // Bằng chứng trực tiếp: không có Supplier nào mang đúng mã vừa cố nhập.
    const importedRow = await prisma.supplier.findFirst({
      where: { organizationId: orgId, code: importCode },
    });
    expect(importedRow).toBeNull();
  });

  it('CASE 14: BASIC tenant CÓ SUPPLIER → POST /suppliers/import vẫn thành công (đường vào entitled không bị ảnh hưởng)', async () => {
    const { ownerToken, orgId } = await createOrgWithPlan(
      'BASIC',
      'case14-basic-import',
    );
    const importCode = `CASE14-${Date.now()}`;
    const workbook = await buildValidSupplierImportWorkbook(importCode);

    const res = await request(app.getHttpServer())
      .post('/api/v1/suppliers/import')
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', workbook, 'suppliers.xlsx')
      .expect(201);
    expect(res.body.data.createdCount).toBe(1);

    const importedRow = await prisma.supplier.findFirst({
      where: { organizationId: orgId, code: importCode },
    });
    expect(importedRow).not.toBeNull();
  });

  // T053.06D — POST /suppliers/:id/restore trước đây KHÔNG mang @RequireEntitlement('SUPPLIER')
  // (create()/import() có, restore() thì không) — cùng lớp lỗi T053.06C, phát hiện qua narrow
  // completeness sweep T053.06D §4. CASE 15/16 chứng minh đã đóng lỗ hổng, dùng ĐÚNG helper đã có.
  it('CASE 15: FREE tenant KHÔNG có SUPPLIER → POST /suppliers/:id/restore bị từ chối 403 ENTITLEMENT_001, Supplier VẪN còn ARCHIVED, KHÔNG ghi audit "supplier.restore"', async () => {
    const { ownerToken, orgId } = await createOrgWithPlan(
      'FREE',
      'case15-free-restore',
    );
    // Seed thẳng 1 Supplier ĐÃ ARCHIVED qua Prisma (không qua API — org FREE sẽ bị chặn ngay ở
    // create()/import() nếu đi qua API, đúng ý đồ CASE 11/13 — archived fixture cần tồn tại TRƯỚC
    // để restore() có gì để thử khôi phục).
    const archivedSupplier = await prisma.supplier.create({
      data: {
        organizationId: orgId,
        code: `CASE15-${Date.now()}`,
        companyName: 'Case 15 Archived Supplier',
        status: 'ARCHIVED',
        deletedAt: new Date(),
      },
    });

    const beforeAuditCount = await prisma.auditLog.count({
      where: { organizationId: orgId, action: 'supplier.restore' },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/suppliers/${archivedSupplier.id}/restore`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ version: archivedSupplier.version })
      .expect(403);
    expect(res.body.code).toBe('ENTITLEMENT_001');

    const afterSupplier = await prisma.supplier.findUniqueOrThrow({
      where: { id: archivedSupplier.id },
    });
    expect(afterSupplier.status).toBe('ARCHIVED');
    expect(afterSupplier.deletedAt).not.toBeNull();
    expect(afterSupplier.version).toBe(archivedSupplier.version);

    const afterAuditCount = await prisma.auditLog.count({
      where: { organizationId: orgId, action: 'supplier.restore' },
    });
    expect(afterAuditCount).toBe(beforeAuditCount);
  });

  it('CASE 16: BASIC tenant CÓ SUPPLIER → POST /suppliers/:id/restore vẫn thành công (đường vào entitled không bị ảnh hưởng)', async () => {
    const { ownerToken, orgId } = await createOrgWithPlan(
      'BASIC',
      'case16-basic-restore',
    );
    const archivedSupplier = await prisma.supplier.create({
      data: {
        organizationId: orgId,
        code: `CASE16-${Date.now()}`,
        companyName: 'Case 16 Archived Supplier',
        status: 'ARCHIVED',
        deletedAt: new Date(),
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/suppliers/${archivedSupplier.id}/restore`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ version: archivedSupplier.version })
      .expect(201);
    expect(res.body.data.status).toBe('INACTIVE');

    const afterSupplier = await prisma.supplier.findUniqueOrThrow({
      where: { id: archivedSupplier.id },
    });
    expect(afterSupplier.deletedAt).toBeNull();
    expect(afterSupplier.status).toBe('INACTIVE');
  });

  // T053.06D — POST /roles/:id/permissions trước đây KHÔNG mang @RequireEntitlement('RBAC_MANAGEMENT')
  // (create() có, assignPermissions() thì không) — cùng lớp lỗi T053.06C. CASE 17/18 chứng minh đã
  // đóng lỗ hổng. Actor dùng ownerToken (allPermissionCodes — LUÔN có role:update thật) để chứng
  // minh 403 đến từ ENTITLEMENT, không phải thiếu RBAC permission.
  it('CASE 17: FREE tenant KHÔNG có RBAC_MANAGEMENT (actor CÓ role:update thật) → POST /roles/:id/permissions bị từ chối 403 ENTITLEMENT_001, RolePermission KHÔNG đổi', async () => {
    const { ownerToken, orgId } = await createOrgWithPlan(
      'FREE',
      'case17-free-rbac',
    );
    // Seed thẳng 1 Role qua Prisma (không qua API — create() cũng bị chặn entitlement ở org FREE).
    const role = await prisma.role.create({
      data: {
        organizationId: orgId,
        code: `case17_role_${Date.now()}`,
        name: 'Case 17 Role',
      },
    });

    const beforeRolePermissions = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/roles/${role.id}/permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permissionCodes: ['supplier:view'] })
      .expect(403);
    expect(res.body.code).toBe('ENTITLEMENT_001');

    const afterRolePermissions = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });
    // RolePermission byte/row-equivalent trước vs sau — 403 đến từ ENTITLEMENT (đứng TRƯỚC
    // RbacService.assignPermissions() trong chuỗi guard), KHÔNG có bất kỳ ghi nào lọt qua.
    expect(afterRolePermissions).toEqual(beforeRolePermissions);
  });

  it('CASE 18: PRO tenant CÓ RBAC_MANAGEMENT → POST /roles/:id/permissions vẫn thành công (đường vào entitled không bị ảnh hưởng)', async () => {
    const { ownerToken, orgId } = await createOrgWithPlan(
      'PRO',
      'case18-pro-rbac',
    );
    const role = await prisma.role.create({
      data: {
        organizationId: orgId,
        code: `case18_role_${Date.now()}`,
        name: 'Case 18 Role',
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/roles/${role.id}/permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permissionCodes: ['supplier:view'] })
      .expect(201);

    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'supplier:view' },
    });
    const rolePermission = await prisma.rolePermission.findFirst({
      where: { roleId: role.id, permissionId: permission.id },
    });
    expect(rolePermission).not.toBeNull();
  });

  // ============================================================
  // Architect Decision (Current Entitlement Context Defect) — GET /entitlements/current: hợp đồng
  // đọc HẸP, KHÔNG yêu cầu organization:view hay bất kỳ permission nào — chỉ cần đăng nhập.
  // ============================================================

  it('CASE E1: user KHÔNG có organization:view vẫn gọi được GET /entitlements/current = 200', async () => {
    const { orgId, unique } = await createOrgWithPlan('ENTERPRISE', 'case-e1');
    // `createNoPermissionUser` gán Role KHÔNG permission nào — chắc chắn không có organization:view.
    const noPermToken = await createNoPermissionUser(orgId, unique);
    await request(app.getHttpServer())
      .get('/api/v1/entitlements/current')
      .set('Authorization', `Bearer ${noPermToken}`)
      .expect(200);
  });

  it('CASE E2/E4: FREE user nhận đúng tập effectiveFeatures của FREE (thuộc đúng organizationId của actor)', async () => {
    const { orgId, unique } = await createOrgWithPlan('FREE', 'case-e2-free');
    const noPermToken = await createNoPermissionUser(orgId, unique);
    const res = await request(app.getHttpServer())
      .get('/api/v1/entitlements/current')
      .set('Authorization', `Bearer ${noPermToken}`)
      .expect(200);
    const features: string[] = res.body.data.effectiveFeatures;
    expect(features).toEqual(
      expect.arrayContaining([
        'DASHBOARD',
        'PRODUCT_BASIC',
        'CUSTOMER_BASIC',
        'POS_SALES',
      ]),
    );
    expect(features).not.toEqual(
      expect.arrayContaining(['USER_MANAGEMENT', 'SUPPLIER']),
    );
  });

  it('CASE E3: client KHÔNG thể cung cấp organizationId khác để dò thông tin tổ chức khác — route không có tham số nào, luôn dùng actor.organizationId', async () => {
    const orgA = await createOrgWithPlan('FREE', 'case-e3-a');
    const orgB = await createOrgWithPlan('ENTERPRISE', 'case-e3-b');
    const noPermTokenA = await createNoPermissionUser(orgA.orgId, orgA.unique);

    // Thử "tiêm" organizationId của Org B (ENTERPRISE) qua query string — route không đọc tham số
    // này ở đâu cả, kết quả PHẢI vẫn là entitlement của Org A (FREE), không lộ/áp dụng Org B.
    const res = await request(app.getHttpServer())
      .get(`/api/v1/entitlements/current?organizationId=${orgB.orgId}`)
      .set('Authorization', `Bearer ${noPermTokenA}`)
      .expect(200);
    const features: string[] = res.body.data.effectiveFeatures;
    expect(features).not.toEqual(
      expect.arrayContaining(['USER_MANAGEMENT', 'SUPPLIER']),
    );
  });

  it('CASE E5: ENTERPRISE user nhận đủ toàn bộ 15 feature hiện tại', async () => {
    const { orgId, unique } = await createOrgWithPlan(
      'ENTERPRISE',
      'case-e5-enterprise',
    );
    const noPermToken = await createNoPermissionUser(orgId, unique);
    const res = await request(app.getHttpServer())
      .get('/api/v1/entitlements/current')
      .set('Authorization', `Bearer ${noPermToken}`)
      .expect(200);
    expect((res.body.data.effectiveFeatures as string[]).length).toBe(15);
  });

  it('CASE E6: override vẫn được áp dụng đúng qua endpoint mới', async () => {
    const { orgId, unique } = await createOrgWithPlan(
      'BASIC',
      'case-e6-override',
    );
    await prisma.organizationSubscription.update({
      where: { organizationId: orgId },
      data: { entitlementOverrides: { RBAC_MANAGEMENT: true } },
    });
    const noPermToken = await createNoPermissionUser(orgId, unique);
    const res = await request(app.getHttpServer())
      .get('/api/v1/entitlements/current')
      .set('Authorization', `Bearer ${noPermToken}`)
      .expect(200);
    expect(res.body.data.effectiveFeatures).toEqual(
      expect.arrayContaining(['RBAC_MANAGEMENT']),
    );
  });

  it('CASE E7: subscription thiếu/hỏng → effectiveFeatures rỗng, KHÔNG BAO GIỜ mặc định thành đủ mọi feature', async () => {
    const { orgId, unique, ownerToken } = await createOrgWithPlan(
      'ENTERPRISE',
      'case-e7-missing-sub',
    );
    // Xác nhận baseline trước khi xoá: ENTERPRISE thật sự cho đủ 15 feature.
    const before = await request(app.getHttpServer())
      .get('/api/v1/entitlements/current')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect((before.body.data.effectiveFeatures as string[]).length).toBe(15);

    await prisma.organizationSubscription.delete({
      where: { organizationId: orgId },
    });

    const noPermToken = await createNoPermissionUser(orgId, unique);
    const after = await request(app.getHttpServer())
      .get('/api/v1/entitlements/current')
      .set('Authorization', `Bearer ${noPermToken}`)
      .expect(200);
    expect(after.body.data.effectiveFeatures).toEqual([]);
  });

  // ============================================================
  // Ma trận RBAC × Entitlement độc lập — chứng minh 4 tổ hợp, cùng CASE 11 (BASIC+SUPPLIER→cả 2
  // đồng ý) đã có sẵn ở trên. Trọng tâm defect vừa sửa: user KHÔNG có organization:view nhưng CÓ
  // user:view, trên tổ chức ENTERPRISE, PHẢI thấy USER_MANAGEMENT=true (EntitlementGate qua),
  // quyết định cuối do PermissionGate/user:view quyết định — không bị entitlement "che" sai.
  // ============================================================

  it('Ma trận: RBAC yes + Entitlement yes → cho phép (ENTERPRISE + user:view)', async () => {
    const { orgId, unique } = await createOrgWithPlan(
      'ENTERPRISE',
      'matrix-yes-yes',
    );
    const role = await prisma.role.create({
      data: {
        organizationId: orgId,
        code: `matrix_yy_${unique.replace(/[^a-z0-9]/gi, '').slice(0, 15)}`,
        name: 'user:view only',
      },
    });
    const userViewPermission = await prisma.permission.findFirstOrThrow({
      where: { code: 'user:view' },
    });
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: userViewPermission.id },
    });
    const passwordHash = await argon2.hash('Password123', {
      type: argon2.argon2id,
    });
    const user = await prisma.user.create({
      data: {
        organizationId: orgId,
        username: `matrixyy-${unique.replace(/[^a-z0-9]/gi, '').slice(0, 15)}`,
        email: `matrixyy-${unique}@e2e.local`,
        passwordHash,
      },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
    const token = jwtService.sign({
      sub: user.id,
      organizationId: orgId,
      branchId: null,
      email: user.email,
      permissions: ['user:view'],
      permissionVersion: user.permissionVersion,
      isPlatformAdmin: false,
    });

    // Entitlement (ENTERPRISE) allows USER_MANAGEMENT — confirmed via the same read the frontend
    // hook uses, no longer gated behind organization:view.
    const entitlementRes = await request(app.getHttpServer())
      .get('/api/v1/entitlements/current')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(entitlementRes.body.data.effectiveFeatures).toEqual(
      expect.arrayContaining(['USER_MANAGEMENT']),
    );
    // RBAC (user:view) allows read access — GET /users succeeds.
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('Ma trận: RBAC yes + Entitlement no → từ chối bởi entitlement (BASIC + user:view, thiếu USER_MANAGEMENT)', async () => {
    const { orgId, unique } = await createOrgWithPlan('BASIC', 'matrix-yes-no');
    const noPermToken = await createNoPermissionUser(orgId, unique);
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${noPermToken}`)
      .send({
        username: `matrixyn-${Date.now()}`,
        email: `matrixyn-${Date.now()}@e2e.local`,
        password: 'Password123',
      })
      .expect(403);
    // No RBAC permission at all here, but the point of this case is entitlement — BASIC genuinely
    // excludes USER_MANAGEMENT, so entitlement (checked first) is what rejects it regardless.
    expect(res.body.code).toBe('ENTITLEMENT_001');
  });

  it('Ma trận: RBAC no + Entitlement yes → từ chối bởi RBAC (ENTERPRISE, actor không có user:create)', async () => {
    const { orgId, unique } = await createOrgWithPlan(
      'ENTERPRISE',
      'matrix-no-yes',
    );
    const noPermToken = await createNoPermissionUser(orgId, unique);
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${noPermToken}`)
      .send({
        username: `matrixny-${Date.now()}`,
        email: `matrixny-${Date.now()}@e2e.local`,
        password: 'Password123',
      })
      .expect(403);
    expect(res.body.code).toBe('RBAC_004');
  });

  it('Ma trận: RBAC no + Entitlement no → từ chối (FREE, không permission)', async () => {
    const { orgId, unique } = await createOrgWithPlan('FREE', 'matrix-no-no');
    const noPermToken = await createNoPermissionUser(orgId, unique);
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${noPermToken}`)
      .send({
        username: `matrixnn-${Date.now()}`,
        email: `matrixnn-${Date.now()}@e2e.local`,
        password: 'Password123',
      })
      .expect(403);
    expect(res.body.code).toBe('ENTITLEMENT_001');
  });

  it('GET /organizations/current trả về effectiveFeatures đúng theo Plan (tiện ích UI, không phải nguồn xác thực)', async () => {
    const { ownerToken } = await createOrgWithPlan('PRO', 'case-current-org');
    const res = await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const features: string[] = res.body.data.subscription.effectiveFeatures;
    expect(features).toEqual(
      expect.arrayContaining([
        'USER_MANAGEMENT',
        'RBAC_MANAGEMENT',
        'MULTI_BRANCH_ADVANCED',
      ]),
    );
    expect(features).not.toEqual(expect.arrayContaining(['API_ACCESS']));
  });

  // Architect Decision (Platform Admin Entitlement Bypass, sau T053.02A) — isPlatformAdmin KHÔNG
  // còn bypass entitlement trên route tenant thường (§5D). Organization bootstrap không có
  // OrganizationSubscription nào (fixture raw `organization.upsert()` phía trên không tạo) —
  // EntitlementService fail-closed (tập rỗng), nên đúng ra PHẢI bị từ chối dù actor là Platform
  // Admin — đây chính là bằng chứng "không có ngoại lệ isPlatformAdmin" thay vì chỉ là hệ quả tình
  // cờ của fixture.
  it('PLATFORM ADMIN KHÔNG bypass entitlement: Organization bootstrap không có gói hợp lệ (fail-closed) => vẫn 403 ENTITLEMENT_001', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        username: `platform-admin-blocked-${Date.now()}`,
        email: `platform-admin-blocked-${Date.now()}@e2e.local`,
        password: 'Password123',
      })
      .expect(403);
    expect(res.body.code).toBe('ENTITLEMENT_001');
  });

  // Đối chứng: khi CHÍNH Organization của Platform Admin có plan hợp lệ, request thành công — chứng
  // minh kết quả phụ thuộc đúng entitlement thật của Organization, không phải cờ isPlatformAdmin.
  it('PLATFORM ADMIN vẫn được phép khi Organization của chính họ CÓ entitlement hợp lệ (đánh giá bình thường, không phải ngoại lệ)', async () => {
    const bootstrapOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'org-e2e-entitlement-bootstrap' },
    });
    await prisma.organizationSubscription.upsert({
      where: { organizationId: bootstrapOrg.id },
      create: { organizationId: bootstrapOrg.id, plan: 'TRIAL' },
      update: { plan: 'TRIAL' },
    });

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        username: `platform-admin-allowed-${Date.now()}`,
        email: `platform-admin-allowed-${Date.now()}@e2e.local`,
        password: 'Password123',
      })
      .expect(201);
  });

  // POST /organizations là route Platform Admin THẬT (PlatformAdminGuard) — không gắn
  // @RequireEntitlement() — phải luôn hoạt động bình thường qua đúng cơ chế PlatformAdminGuard,
  // không liên quan gì tới entitlement của tổ chức MỚI được tạo.
  it('POST /organizations (route Platform Admin thật) không bị ảnh hưởng bởi thay đổi entitlement — vẫn hoạt động qua PlatformAdminGuard', async () => {
    const slug = `platform-route-unaffected-${Date.now()}`;
    await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        organization: { displayName: 'Unaffected', slug },
        owner: {
          fullName: 'Owner',
          email: `owner-${Date.now()}@unaffected.local`,
          password: 'Password123',
        },
      })
      .expect(201);
  });
});
