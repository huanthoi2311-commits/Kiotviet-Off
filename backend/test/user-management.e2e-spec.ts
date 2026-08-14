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
 * T052.02B — real-Postgres E2E cho User Management (backend), Architect authorization §TEST HARD
 * GATES. Dùng real HTTP (`request(app.getHttpServer())`) + real JWT (`app.get(JwtService).sign`
 * cho actor cố định; login/refresh THẬT qua `/auth/*` khi cần chứng minh session revocation —
 * X-Client-Type: mobile để refreshToken trả về trong body, tránh phức tạp hoá cookie jar trong
 * supertest, vẫn là 1 luồng client CHÍNH THỐNG được hỗ trợ, không phải hack).
 *
 * KHÔNG tự chạy được trong sandbox này (thiếu Docker/PostgreSQL) — cùng giới hạn với các
 * *.e2e-spec.ts khác trong repo. Chạy trong CI qua `npm run test:e2e`.
 */
describe('User Management (e2e, integration — Postgres thật)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  interface OrgFixture {
    organizationId: string;
    organizationSlug: string;
    branchId: string;
    ownerUserId: string;
    ownerEmail: string;
    ownerPassword: string;
    accessToken: string;
  }

  let orgA: OrgFixture;
  let orgB: OrgFixture;

  async function setupOrganization(
    slug: string,
    code: string,
  ): Promise<OrgFixture> {
    const organization = await prisma.organization.upsert({
      where: { slug },
      create: { code, displayName: `${code} Org`, slug },
      update: {},
    });
    const organizationId = organization.id;

    // T051.08D — Organization/Settings/Subscription là 1 aggregate bắt buộc đủ cả 3
    // (`OrganizationRepository.findById()`) — UserService.deactivate() dùng chính port này để tra
    // Organization.ownerUserId (D1 owner-protection); thiếu 1 trong 2 bảng dưới sẽ khiến
    // findById() trả null và owner-check bị BỎ QUA TRONG IM LẶNG thay vì throw — phải tạo đủ.
    await prisma.organizationSettings.upsert({
      where: { organizationId },
      create: { organizationId },
      update: {},
    });
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
      where: { organizationId_code: { organizationId, code: 'um_e2e_role' } },
      create: { organizationId, code: 'um_e2e_role', name: 'UM E2E Role' },
      update: {},
    });

    const userPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'user:' } },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: userPermissions.map((p) => ({
        roleId: role.id,
        permissionId: p.id,
      })),
      skipDuplicates: true,
    });

    const branch = await prisma.branch.upsert({
      where: { organizationId_code: { organizationId, code: `${code}-BR` } },
      create: { organizationId, code: `${code}-BR`, name: `${code} Branch` },
      update: {},
    });

    const ownerEmail = `owner-${slug}@pos-erp.local`;
    const ownerPassword = 'OwnerPass@123';
    const passwordHash = await argon2.hash(ownerPassword, {
      type: argon2.argon2id,
    });
    const owner = await prisma.user.upsert({
      where: { organizationId_email: { organizationId, email: ownerEmail } },
      create: {
        organizationId,
        branchId: branch.id,
        username: `owner-${slug}`,
        email: ownerEmail,
        passwordHash,
      },
      update: {},
    });
    await prisma.organization.update({
      where: { id: organizationId },
      data: { ownerUserId: owner.id },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: owner.id, roleId: role.id } },
      create: { userId: owner.id, roleId: role.id },
      update: {},
    });

    const accessToken = app.get(JwtService).sign({
      sub: owner.id,
      organizationId,
      branchId: branch.id,
      email: owner.email,
      permissions: userPermissions.map((p) => p.code),
      permissionVersion: owner.permissionVersion,
    });

    return {
      organizationId,
      organizationSlug: slug,
      branchId: branch.id,
      ownerUserId: owner.id,
      ownerEmail,
      ownerPassword,
      accessToken,
    };
  }

  function uniqueSuffix(): string {
    return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  }

  function createUserRequest(
    fixture: OrgFixture,
    overrides: Partial<{
      username: string;
      email: string;
      password: string;
      branchId: string;
    }> = {},
  ) {
    const suffix = uniqueSuffix();
    return request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${fixture.accessToken}`)
      .send({
        username: overrides.username ?? `staff${suffix}`,
        email: overrides.email ?? `staff${suffix}@acme.test`,
        password: overrides.password ?? 'StaffPass@123',
        ...(overrides.branchId ? { branchId: overrides.branchId } : {}),
      });
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await createE2eApp(moduleFixture);

    orgA = await setupOrganization('user-mgmt-e2e-a', 'UM-A');
    orgB = await setupOrganization('user-mgmt-e2e-b', 'UM-B');
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('CASE 1 — Org A tạo user, đọc và cập nhật được', async () => {
    const created = await createUserRequest(orgA).expect(201);
    const userId = created.body.data.id;
    expect(created.body.data.passwordHash).toBeUndefined();

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/users/${userId}`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .expect(200);
    expect(detail.body.data.id).toBe(userId);
    expect(detail.body.data.roleCodes).toEqual([]);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/users/${userId}`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ fullName: 'Đã cập nhật' })
      .expect(200);
    expect(updated.body.data.fullName).toBe('Đã cập nhật');
  });

  it('CASE 2 — Org A không thể list/read/update/deactivate/reactivate/reset-password user của Org B (non-disclosing)', async () => {
    const createdB = await createUserRequest(orgB).expect(201);
    const orgBUserId = createdB.body.data.id;

    const list = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .expect(200);
    expect(
      (list.body.data.items as { id: string }[]).some(
        (u) => u.id === orgBUserId,
      ),
    ).toBe(false);

    const read = await request(app.getHttpServer())
      .get(`/api/v1/users/${orgBUserId}`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .expect(404);
    expect(read.body.code).toBe('USER_001');

    await request(app.getHttpServer())
      .patch(`/api/v1/users/${orgBUserId}`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ fullName: 'x' })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/users/${orgBUserId}/deactivate`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/users/${orgBUserId}/reactivate`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/users/${orgBUserId}/reset-password`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ newPassword: 'Whatever@123' })
      .expect(404);
  });

  it('CASE 3 — branchId thuộc tổ chức khác bị từ chối trên create/update, không có quan hệ cross-tenant nào được ghi', async () => {
    const suffix = uniqueSuffix();
    const rejectedCreate = await createUserRequest(orgA, {
      username: `crossbr${suffix}`,
      email: `crossbr${suffix}@acme.test`,
      branchId: orgB.branchId,
    }).expect(404);
    expect(rejectedCreate.body.code).toBe('BRANCH_001');

    const persisted = await prisma.user.findFirst({
      where: {
        organizationId: orgA.organizationId,
        username: `crossbr${suffix}`,
      },
    });
    expect(persisted).toBeNull();

    const created = await createUserRequest(orgA).expect(201);
    const userId = created.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/users/${userId}`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ branchId: orgB.branchId })
      .expect(404);

    const afterAttempt = await prisma.user.findUnique({
      where: { id: userId },
    });
    expect(afterAttempt?.branchId).not.toBe(orgB.branchId);
  });

  it('CASE 4 — username unique theo tổ chức: cùng username cùng org bị từ chối, khác org được phép', async () => {
    const suffix = uniqueSuffix();
    const username = `dup${suffix}`;

    await createUserRequest(orgA, {
      username,
      email: `dup1-${suffix}@acme.test`,
    }).expect(201);

    const conflict = await createUserRequest(orgA, {
      username,
      email: `dup2-${suffix}@acme.test`,
    }).expect(409);
    expect(conflict.body.code).toBe('USER_002');

    await createUserRequest(orgB, {
      username,
      email: `dup3-${suffix}@acme.test`,
    }).expect(201);
  });

  it('CASE 5 — email unique theo tổ chức: cùng email cùng org bị từ chối, khác org được phép', async () => {
    const suffix = uniqueSuffix();
    const email = `dupemail${suffix}@acme.test`;

    await createUserRequest(orgA, {
      username: `emailuser1-${suffix}`,
      email,
    }).expect(201);

    const conflict = await createUserRequest(orgA, {
      username: `emailuser2-${suffix}`,
      email,
    }).expect(409);
    expect(conflict.body.code).toBe('USER_003');

    await createUserRequest(orgB, {
      username: `emailuser3-${suffix}`,
      email,
    }).expect(201);
  });

  it('CASE 6 — deactivate: ACTIVE → INACTIVE, thu hồi toàn bộ session, refresh/access token cũ không dùng được nữa', async () => {
    const suffix = uniqueSuffix();
    const targetEmail = `deactivate-target${suffix}@acme.test`;
    const targetPassword = 'TargetPass@123';
    await createUserRequest(orgA, {
      username: `deactivatetarget${suffix}`,
      email: targetEmail,
      password: targetPassword,
    }).expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Client-Type', 'mobile')
      .send({
        organizationSlug: orgA.organizationSlug,
        email: targetEmail,
        password: targetPassword,
      })
      .expect(200);
    const targetAccessToken = login.body.data.accessToken as string;
    const targetRefreshToken = login.body.data.refreshToken as string;
    const targetUserId = login.body.data.userInfo.id as string;

    const deactivateRes = await request(app.getHttpServer())
      .patch(`/api/v1/users/${targetUserId}/deactivate`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .expect(200);
    expect(deactivateRes.body.data.status).toBe('INACTIVE');

    // Bằng chứng TRẠNG THÁI DATABASE THẬT — không còn session nào chưa bị thu hồi.
    const activeSessions = await prisma.session.findMany({
      where: { userId: targetUserId, revokedAt: null },
    });
    expect(activeSessions).toHaveLength(0);

    // Refresh token cũ (issued trước khi deactivate) không còn dùng được — status !== ACTIVE.
    const refreshAttempt = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('X-Client-Type', 'mobile')
      .send({ refreshToken: targetRefreshToken })
      .expect(401);
    expect(refreshAttempt.body.code).toBe('AUTH_002');

    // Access token cũ (còn hạn, chữ ký hợp lệ) vẫn bị chặn — JwtAccessStrategy.validate() kiểm tra
    // status LIVE từ DB ở MỌI request, độc lập với việc revoke session đã xảy ra hay chưa.
    const protectedCallAttempt = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${targetAccessToken}`)
      .expect(401);
    expect(protectedCallAttempt.body.code).toBe('AUTH_002');
  });

  it('CASE 7 — owner/self protection: tự vô hiệu hóa chính mình bị từ chối, vô hiệu hóa owner (bởi actor khác) bị từ chối, trạng thái không đổi', async () => {
    const selfAttempt = await request(app.getHttpServer())
      .patch(`/api/v1/users/${orgA.ownerUserId}/deactivate`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .expect(422);
    expect(selfAttempt.body.code).toBe('USER_004');

    // Actor thứ 2 (không phải owner, có user:deactivate) cố vô hiệu hóa owner.
    const suffix = uniqueSuffix();
    const secondAdminEmail = `second-admin${suffix}@acme.test`;
    const secondAdminPassword = 'SecondAdmin@123';
    const secondAdmin = await createUserRequest(orgA, {
      username: `secondadmin${suffix}`,
      email: secondAdminEmail,
      password: secondAdminPassword,
    }).expect(201);
    const secondAdminUserId = secondAdmin.body.data.id;

    await request(app.getHttpServer())
      .post('/api/v1/roles/assign')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ userId: secondAdminUserId, roleId: await getUmRoleId(orgA) })
      .expect(201);

    const secondAdminToken = app.get(JwtService).sign({
      sub: secondAdminUserId,
      organizationId: orgA.organizationId,
      branchId: orgA.branchId,
      email: secondAdminEmail,
      permissions: [
        'user:view',
        'user:deactivate',
        'user:activate',
        'user:update',
        'user:create',
      ],
      permissionVersion: 1,
    });

    const ownerAttempt = await request(app.getHttpServer())
      .patch(`/api/v1/users/${orgA.ownerUserId}/deactivate`)
      .set('Authorization', `Bearer ${secondAdminToken}`)
      .expect(422);
    expect(ownerAttempt.body.code).toBe('USER_005');

    const ownerAfter = await prisma.user.findUnique({
      where: { id: orgA.ownerUserId },
    });
    expect(ownerAfter?.status).toBe('ACTIVE');
  });

  it('CASE 8 — admin reset password: mật khẩu cũ không dùng được, mật khẩu mới dùng được, session cũ bị thu hồi', async () => {
    const suffix = uniqueSuffix();
    const targetEmail = `reset-target${suffix}@acme.test`;
    const oldPassword = 'OldPass@123';
    const newPassword = 'NewPass@456';
    await createUserRequest(orgA, {
      username: `resettarget${suffix}`,
      email: targetEmail,
      password: oldPassword,
    }).expect(201);

    const loginBefore = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Client-Type', 'mobile')
      .send({
        organizationSlug: orgA.organizationSlug,
        email: targetEmail,
        password: oldPassword,
      })
      .expect(200);
    const oldRefreshToken = loginBefore.body.data.refreshToken as string;
    const targetUserId = loginBefore.body.data.userInfo.id as string;

    await request(app.getHttpServer())
      .patch(`/api/v1/users/${targetUserId}/reset-password`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ newPassword })
      .expect(204);

    const loginOldPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Client-Type', 'mobile')
      .send({
        organizationSlug: orgA.organizationSlug,
        email: targetEmail,
        password: oldPassword,
      })
      .expect(401);
    expect(loginOldPassword.body.code).toBe('AUTH_001');

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Client-Type', 'mobile')
      .send({
        organizationSlug: orgA.organizationSlug,
        email: targetEmail,
        password: newPassword,
      })
      .expect(200);

    const refreshOldSession = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('X-Client-Type', 'mobile')
      .send({ refreshToken: oldRefreshToken })
      .expect(401);
    expect(refreshOldSession.body.code).toBe('AUTH_002');
  });

  async function getUmRoleId(fixture: OrgFixture): Promise<string> {
    const role = await prisma.role.findFirstOrThrow({
      where: { organizationId: fixture.organizationId, code: 'um_e2e_role' },
      select: { id: true },
    });
    return role.id;
  }
});
