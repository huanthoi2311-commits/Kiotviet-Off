import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './helpers/create-e2e-app';
import { AppModule } from '../src/app.module';
import { PERMISSION_CATALOG } from '../src/modules/rbac/infrastructure/permission-catalog';

/**
 * T052.03B — real-Postgres E2E for the owner-lockout safety invariant (§6 of "ARCHITECT DECISION
 * — T052.03B MODULE DEPENDENCY CONFLICT ROUND 2, Q4 APPROVED"): after any `assignPermissions` or
 * `removeRoleFromUser` mutation, `Organization.ownerUserId` must retain effective `role:update`
 * across ALL of their roles combined — never protected by role code/name/`isSystem` alone.
 *
 * Deliberately a separate file from `rbac-tenant-isolation.e2e-spec.ts` — that file proves
 * cross-tenant isolation (a security boundary), this one proves a business invariant. Both now
 * cover `DELETE /roles/:roleId/users/:userId` from their own angle (tenant isolation there,
 * owner-lockout here).
 *
 * Fixture narrative (mirrors §15's explicit multi-role requirement):
 *   Owner starts holding TWO roles that both grant `role:update`: `owner_role_a` and
 *   `owner_role_b` (each also grants `user:update` so the owner's JWT — signed once, permissions
 *   are a static JWT claim per `PermissionsGuard`, not re-derived from DB per request — stays
 *   usable for every call below regardless of which role currently holds what).
 *   CASE A -> F below execute IN ORDER; later cases depend on the DB state left by earlier ones,
 *   same chaining pattern already used by `rbac-tenant-isolation.e2e-spec.ts` test 5.
 *
 * KHÔNG tự chạy được trong sandbox này (thiếu Docker/PostgreSQL). Chạy trong CI qua
 * `npm run test:e2e -- rbac-owner-protection.e2e-spec.ts`.
 */
describe('RBAC Owner-Lockout Protection (e2e, T052.03B)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId: string;
  let ownerUserId: string;
  let regularUserId: string;
  let ownerRoleAId: string;
  let ownerRoleBId: string;
  let otherRoleId: string;
  let ownerToken: string;

  async function seedRole(
    orgId: string,
    code: string,
    permissionCodes: string[],
  ) {
    const role = await prisma.role.upsert({
      where: { organizationId_code: { organizationId: orgId, code } },
      create: { organizationId: orgId, code, name: code },
      update: {},
    });
    const permissions = await prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    return role.id;
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

    const organization = await prisma.organization.upsert({
      where: { slug: 'rbac-owner-protection-e2e-org' },
      create: {
        code: 'ORG-RBAC-OWNER-PROT',
        displayName: 'RBAC Owner Protection Org',
        slug: 'rbac-owner-protection-e2e-org',
      },
      update: {},
    });
    organizationId = organization.id;

    ownerRoleAId = await seedRole(organizationId, 'owner_role_a', [
      'role:update',
      'role:view',
      'user:update',
    ]);
    ownerRoleBId = await seedRole(organizationId, 'owner_role_b', [
      'role:update',
      'user:update',
    ]);
    otherRoleId = await seedRole(organizationId, 'other_role', [
      'product:view',
    ]);

    const owner = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId,
          email: 'owner-protection-owner@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'owner-protection-owner',
        email: 'owner-protection-owner@pos-erp.local',
        passwordHash: 'x',
      },
      update: {},
    });
    ownerUserId = owner.id;

    const regular = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId,
          email: 'owner-protection-regular@pos-erp.local',
        },
      },
      create: {
        organizationId,
        username: 'owner-protection-regular',
        email: 'owner-protection-regular@pos-erp.local',
        passwordHash: 'x',
      },
      update: {},
    });
    regularUserId = regular.id;

    await prisma.organization.update({
      where: { id: organizationId },
      data: { ownerUserId: owner.id },
    });

    for (const roleId of [ownerRoleAId, ownerRoleBId]) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: owner.id, roleId } },
        create: { userId: owner.id, roleId },
        update: {},
      });
    }
    await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: regular.id, roleId: otherRoleId },
      },
      create: { userId: regular.id, roleId: otherRoleId },
      update: {},
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await createE2eApp(moduleFixture);

    ownerToken = app.get(JwtService).sign({
      sub: owner.id,
      organizationId,
      branchId: null,
      email: owner.email,
      permissions: ['role:update', 'role:view', 'user:update'],
      permissionVersion: owner.permissionVersion,
      isPlatformAdmin: false,
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('CASE A — assignPermissions: owner does not hold the role being mutated -> allowed regardless of content', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/roles/${otherRoleId}/permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permissionCodes: ['product:view', 'customer:view'] })
      .expect(201);

    const role = await prisma.role.findUnique({
      where: { id: otherRoleId },
      include: { rolePermissions: { include: { permission: true } } },
    });
    expect(
      role?.rolePermissions.map((rp) => rp.permission.code).sort(),
    ).toEqual(['customer:view', 'product:view']);
  });

  it('CASE D — removeRoleFromUser: target user is not the owner -> allowed', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/roles/${otherRoleId}/users/${regularUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const assignment = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: regularUserId, roleId: otherRoleId } },
    });
    expect(assignment).toBeNull();
  });

  it('CASE B — assignPermissions: owner holds the role, new permission set still includes role:update -> allowed', async () => {
    const ownerBefore = await prisma.user.findUniqueOrThrow({
      where: { id: ownerUserId },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/roles/${ownerRoleAId}/permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permissionCodes: ['role:update', 'role:view', 'user:update'] })
      .expect(201);

    // Permission-version propagation (§7) — replacePermissions bumps every user holding the role.
    const ownerAfter = await prisma.user.findUniqueOrThrow({
      where: { id: ownerUserId },
    });
    expect(ownerAfter.permissionVersion).toBeGreaterThan(
      ownerBefore.permissionVersion,
    );
  });

  it('CASE E (multi-role, §15) — removeRoleFromUser: owner loses one of TWO role:update-granting roles -> allowed (still has the other)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/roles/${ownerRoleAId}/users/${ownerUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const assignment = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: ownerUserId, roleId: ownerRoleAId } },
    });
    expect(assignment).toBeNull();
    const stillHasRoleB = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: ownerUserId, roleId: ownerRoleBId } },
    });
    expect(stillHasRoleB).not.toBeNull();
  });

  it('CASE F (multi-role, §15) — assignPermissions: owner_role_b is now the SOLE remaining source of role:update -> stripping it is rejected', async () => {
    const roleBefore = await prisma.role.findUnique({
      where: { id: ownerRoleBId },
      include: { rolePermissions: { include: { permission: true } } },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/roles/${ownerRoleBId}/permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ permissionCodes: ['user:update'] })
      .expect(409);
    expect(res.body.code).toBe('RBAC_006');

    // Rejected before mutation — role's permissions must be byte-for-byte unchanged.
    const roleAfter = await prisma.role.findUnique({
      where: { id: ownerRoleBId },
      include: { rolePermissions: { include: { permission: true } } },
    });
    expect(
      roleAfter?.rolePermissions.map((rp) => rp.permission.code).sort(),
    ).toEqual(
      roleBefore?.rolePermissions.map((rp) => rp.permission.code).sort(),
    );
  });

  it('CASE F-alt — removeRoleFromUser: removing owner_role_b (sole remaining role:update source) from the owner is rejected', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/roles/${ownerRoleBId}/users/${ownerUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);
    expect(res.body.code).toBe('RBAC_006');

    const assignment = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: ownerUserId, roleId: ownerRoleBId } },
    });
    expect(assignment).not.toBeNull();
  });

  describe('Invariant failure — organization without a resolvable owner', () => {
    it('assignPermissions on an organization with no resolvable owner surfaces a generic 500, not a misleading 404', async () => {
      const orphanOrg = await prisma.organization.upsert({
        where: { slug: 'rbac-owner-protection-orphan-org' },
        create: {
          code: 'ORG-RBAC-OWNER-ORPHAN',
          displayName: 'RBAC Owner Protection Orphan Org',
          slug: 'rbac-owner-protection-orphan-org',
          // ownerUserId deliberately left null — simulates the invariant being violated.
        },
        update: { ownerUserId: null },
      });

      for (const permission of PERMISSION_CATALOG) {
        await prisma.permission.upsert({
          where: { code: permission.code },
          create: permission,
          update: {},
        });
      }
      const orphanRole = await prisma.role.upsert({
        where: {
          organizationId_code: {
            organizationId: orphanOrg.id,
            code: 'orphan_admin',
          },
        },
        create: {
          organizationId: orphanOrg.id,
          code: 'orphan_admin',
          name: 'orphan_admin',
        },
        update: {},
      });
      const rolePermissions = await prisma.permission.findMany({
        where: { code: { in: ['role:update', 'role:view'] } },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: orphanRole.id },
      });
      await prisma.rolePermission.createMany({
        data: rolePermissions.map((p) => ({
          roleId: orphanRole.id,
          permissionId: p.id,
        })),
        skipDuplicates: true,
      });
      const orphanUser = await prisma.user.upsert({
        where: {
          organizationId_email: {
            organizationId: orphanOrg.id,
            email: 'orphan-admin@pos-erp.local',
          },
        },
        create: {
          organizationId: orphanOrg.id,
          username: 'orphan-admin',
          email: 'orphan-admin@pos-erp.local',
          passwordHash: 'x',
        },
        update: {},
      });
      await prisma.userRole.upsert({
        where: {
          userId_roleId: { userId: orphanUser.id, roleId: orphanRole.id },
        },
        create: { userId: orphanUser.id, roleId: orphanRole.id },
        update: {},
      });

      const orphanToken = app.get(JwtService).sign({
        sub: orphanUser.id,
        organizationId: orphanOrg.id,
        branchId: null,
        email: orphanUser.email,
        permissions: ['role:update', 'role:view'],
        permissionVersion: orphanUser.permissionVersion,
        isPlatformAdmin: false,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/roles/${orphanRole.id}/permissions`)
        .set('Authorization', `Bearer ${orphanToken}`)
        .send({ permissionCodes: ['role:view'] })
        .expect(500);
      expect(res.body.code).toBe('HTTP_500');

      const roleAfter = await prisma.role.findUnique({
        where: { id: orphanRole.id },
        include: { rolePermissions: true },
      });
      expect(roleAfter?.rolePermissions).toHaveLength(2);
    });
  });
});
