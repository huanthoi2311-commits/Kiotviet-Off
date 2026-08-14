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
 * T051.00 — RBAC cross-tenant isolation fix (RB-5). Prior to this fix, `GET /roles/:id`,
 * `POST /roles/:id/permissions`, and `POST /roles/assign` performed zero organizationId
 * verification anywhere in their call chain — any authenticated user holding `role:view`/
 * `role:update`/`user:update` (granted to every organization's seeded "owner" role) could read,
 * mutate, or reassign another organization's roles/users by UUID. This suite proves the fix from
 * outside the process, against real PostgreSQL — two real organizations, two real JWTs, real HTTP
 * calls — not a unit-level mock. KHÔNG tự chạy được trong sandbox này (thiếu Docker).
 *   npm run test:e2e -- rbac-tenant-isolation.e2e-spec.ts
 *
 * Platform Admin: confirmed by source inspection that `isPlatformAdmin` has zero references
 * anywhere in `modules/rbac/**` — the RBAC module has no intentionally-cross-tenant Platform Admin
 * path today, so there is nothing to preserve/test here; this fix does not touch that concern.
 */
describe('RBAC Cross-Tenant Isolation (e2e, T051.00)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let orgAId: string;
  let orgBId: string;

  let orgAAdminToken: string;
  let orgANoRbacPermToken: string;

  let orgATargetRoleId: string;
  let orgATargetUserId: string;
  let orgBRoleId: string;
  let orgBUserId: string;

  async function seedOrganization(slug: string, code: string) {
    const organization = await prisma.organization.upsert({
      where: { slug },
      create: { code, displayName: `${code} Org`, slug },
      update: {},
    });
    return organization.id;
  }

  async function seedRole(
    organizationId: string,
    code: string,
    permissionCodePrefixes: string[],
  ) {
    const role = await prisma.role.upsert({
      where: { organizationId_code: { organizationId, code } },
      create: { organizationId, code, name: code },
      update: {},
    });
    const permissions = await prisma.permission.findMany({
      where: {
        OR: permissionCodePrefixes.map((p) => ({ code: p })),
      },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    return role.id;
  }

  async function seedUser(
    organizationId: string,
    email: string,
    username: string,
    roleId?: string,
  ) {
    const passwordHash = await argon2.hash('E2ePass@123', {
      type: argon2.argon2id,
    });
    const user = await prisma.user.upsert({
      where: { organizationId_email: { organizationId, email } },
      create: { organizationId, username, email, passwordHash },
      update: {},
    });
    if (roleId) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        create: { userId: user.id, roleId },
        update: {},
      });
    }
    return user.id;
  }

  async function signToken(userId: string, organizationId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const roleCodes = await prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
      },
    });
    const permissionCodes = Array.from(
      new Set(
        roleCodes.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.code),
        ),
      ),
    );
    return app.get(JwtService).sign({
      sub: userId,
      organizationId,
      branchId: null,
      email: user.email,
      permissions: permissionCodes,
      permissionVersion: user.permissionVersion,
      isPlatformAdmin: false,
    });
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

    orgAId = await seedOrganization('rbac-iso-e2e-org-a', 'ORG-RBAC-ISO-A');
    orgBId = await seedOrganization('rbac-iso-e2e-org-b', 'ORG-RBAC-ISO-B');

    const orgAAdminRoleId = await seedRole(orgAId, 'rbac_iso_admin', [
      'role:view',
      'role:create',
      'role:update',
      'user:update',
    ]);
    const orgANoRbacPermRoleId = await seedRole(orgAId, 'rbac_iso_no_perm', [
      'product:view',
    ]);
    orgATargetRoleId = await seedRole(orgAId, 'rbac_iso_target', [
      'product:view',
    ]);
    orgBRoleId = await seedRole(orgBId, 'rbac_iso_org_b_role', [
      'product:view',
    ]);

    const orgAAdminUserId = await seedUser(
      orgAId,
      'rbac-iso-admin@pos-erp.local',
      'rbac-iso-admin',
      orgAAdminRoleId,
    );
    const orgANoRbacPermUserId = await seedUser(
      orgAId,
      'rbac-iso-noperm@pos-erp.local',
      'rbac-iso-noperm',
      orgANoRbacPermRoleId,
    );
    orgATargetUserId = await seedUser(
      orgAId,
      'rbac-iso-target@pos-erp.local',
      'rbac-iso-target',
    );
    orgBUserId = await seedUser(
      orgBId,
      'rbac-iso-org-b-user@pos-erp.local',
      'rbac-iso-org-b-user',
    );

    // T052.03B — RbacService.assignPermissions()/removeRoleFromUser() now unconditionally resolve
    // Organization.ownerUserId (owner-lockout invariant, see RbacService.getOwnerUserId()); an
    // organization without a resolvable owner throws a 500 by design, which would break every
    // assignPermissions call in this suite. Bootstrap ownerUserId same as the real product flow
    // (create Organization -> create owner User -> UPDATE Organization.ownerUserId), same pattern
    // `user-management.e2e-spec.ts` already established. Neither org's admin user holds `role:update`
    // ONLY via a role also used as a mutation target in tests 1/3/5/8 below, so this does not change
    // any existing assertion in this file.
    await prisma.organization.update({
      where: { id: orgAId },
      data: { ownerUserId: orgAAdminUserId },
    });
    await prisma.organization.update({
      where: { id: orgBId },
      data: { ownerUserId: orgBUserId },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await createE2eApp(moduleFixture);

    orgAAdminToken = await signToken(orgAAdminUserId, orgAId);
    orgANoRbacPermToken = await signToken(orgANoRbacPermUserId, orgAId);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('1. Org A cannot modify Org B role permissions', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/roles/${orgBRoleId}/permissions`)
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ permissionCodes: ['product:view'] })
      .expect(404);
    expect(res.body.code).toBe('RBAC_001');

    const roleAfter = await prisma.role.findUnique({
      where: { id: orgBRoleId },
      include: { rolePermissions: { include: { permission: true } } },
    });
    expect(roleAfter?.rolePermissions.map((rp) => rp.permission.code)).toEqual([
      'product:view',
    ]);
  });

  it('2. Org A cannot assign a role to an Org B user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/roles/assign')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ userId: orgBUserId, roleId: orgATargetRoleId })
      .expect(404);
    expect(res.body.code).toBe('RBAC_005');

    const assignment = await prisma.userRole.findUnique({
      where: {
        userId_roleId: { userId: orgBUserId, roleId: orgATargetRoleId },
      },
    });
    expect(assignment).toBeNull();
  });

  it('3. Org A cannot assign an Org B role to an Org A user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/roles/assign')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ userId: orgATargetUserId, roleId: orgBRoleId })
      .expect(404);
    expect(res.body.code).toBe('RBAC_001');

    const assignment = await prisma.userRole.findUnique({
      where: {
        userId_roleId: { userId: orgATargetUserId, roleId: orgBRoleId },
      },
    });
    expect(assignment).toBeNull();
  });

  it('4. Org A cannot read Org B role detail', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/roles/${orgBRoleId}`)
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .expect(404);
    expect(res.body.code).toBe('RBAC_001');
  });

  it('5. Same-org legitimate operations continue working', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/roles/${orgATargetRoleId}/permissions`)
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ permissionCodes: ['product:view', 'customer:view'] })
      .expect(201);

    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/roles/${orgATargetRoleId}`)
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .expect(200);
    expect(detailRes.body.data.permissionCodes.sort()).toEqual([
      'customer:view',
      'product:view',
    ]);

    await request(app.getHttpServer())
      .post('/api/v1/roles/assign')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ userId: orgATargetUserId, roleId: orgATargetRoleId })
      .expect(201);

    const assignment = await prisma.userRole.findUnique({
      where: {
        userId_roleId: { userId: orgATargetUserId, roleId: orgATargetRoleId },
      },
    });
    expect(assignment).not.toBeNull();
  });

  it('8. Regression: role:update/user:update are still enforced by PermissionsGuard', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/roles/${orgATargetRoleId}/permissions`)
      .set('Authorization', `Bearer ${orgANoRbacPermToken}`)
      .send({ permissionCodes: ['product:view'] })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/roles/assign')
      .set('Authorization', `Bearer ${orgANoRbacPermToken}`)
      .send({ userId: orgATargetUserId, roleId: orgATargetRoleId })
      .expect(403);
  });

  // T052.03B — DELETE /roles/:roleId/users/:userId (newly exposed) must carry the exact same
  // tenant-isolation guarantees as the other 5 role-mutation endpoints proven above.
  it('9. DELETE /roles/:roleId/users/:userId is tenant-isolated (cross-org user, cross-org role, same-org success)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/roles/assign')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ userId: orgATargetUserId, roleId: orgATargetRoleId })
      .expect(201);

    // 9a. cross-org target user (role is Org A's, user is Org B's) -> RBAC_USER_NOT_FOUND
    const crossUserRes = await request(app.getHttpServer())
      .delete(`/api/v1/roles/${orgATargetRoleId}/users/${orgBUserId}`)
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .expect(404);
    expect(crossUserRes.body.code).toBe('RBAC_005');

    // 9b. cross-org role (role is Org B's, user is Org A's) -> RBAC_ROLE_NOT_FOUND
    const crossRoleRes = await request(app.getHttpServer())
      .delete(`/api/v1/roles/${orgBRoleId}/users/${orgATargetUserId}`)
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .expect(404);
    expect(crossRoleRes.body.code).toBe('RBAC_001');

    // Neither cross-org attempt actually removed the real (same-org) assignment.
    const stillAssigned = await prisma.userRole.findUnique({
      where: {
        userId_roleId: { userId: orgATargetUserId, roleId: orgATargetRoleId },
      },
    });
    expect(stillAssigned).not.toBeNull();

    // 9c. same-org, legitimate removal -> 204, DB reflects the removal.
    await request(app.getHttpServer())
      .delete(`/api/v1/roles/${orgATargetRoleId}/users/${orgATargetUserId}`)
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .expect(204);

    const removed = await prisma.userRole.findUnique({
      where: {
        userId_roleId: { userId: orgATargetUserId, roleId: orgATargetRoleId },
      },
    });
    expect(removed).toBeNull();
  });
});
