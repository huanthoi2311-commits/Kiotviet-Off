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
 * T052.04A — real-Postgres E2E proving `removeRoleFromUser` writes an audit entry on success and
 * ONLY on success (closing the asymmetry with `assignRoleToUser`, which already audited). Reuses
 * the exact fixture pattern already proven in `rbac-owner-protection.e2e-spec.ts`/
 * `rbac-tenant-isolation.e2e-spec.ts` — real HTTP, real JWTs, real Postgres, no mocking.
 *
 * KHÔNG tự chạy được trong sandbox này (thiếu Docker/PostgreSQL). Chạy trong CI qua
 * `npm run test:e2e -- rbac-remove-role-audit.e2e-spec.ts`.
 */
describe('RBAC removeRoleFromUser audit trail (e2e, T052.04A)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

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
    permissionCodes: string[],
  ) {
    const role = await prisma.role.upsert({
      where: { organizationId_code: { organizationId, code } },
      create: { organizationId, code, name: code },
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

  async function seedUser(
    organizationId: string,
    email: string,
    username: string,
    roleId?: string,
  ) {
    const user = await prisma.user.upsert({
      where: { organizationId_email: { organizationId, email } },
      create: { organizationId, username, email, passwordHash: 'x' },
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
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
      },
    });
    const permissionCodes = Array.from(
      new Set(
        userRoles.flatMap((ur) =>
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

  async function countRemoveAuditRows(
    organizationId: string,
    targetUserId: string,
    roleId: string,
  ) {
    return prisma.auditLog.count({
      where: {
        organizationId,
        action: 'user.role.remove',
        entityType: 'User',
        entityId: targetUserId,
        oldValue: { equals: { roleId } },
      },
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

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await createE2eApp(moduleFixture);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('CASE A — same-org successful removal: UserRole deleted, permissionVersion incremented, exactly one matching audit row', async () => {
    const orgId = await seedOrganization(
      'rbac-remove-audit-a',
      'ORG-RM-AUDIT-A',
    );
    const adminRoleId = await seedRole(orgId, 'rm_audit_admin', [
      'role:view',
      'user:update',
    ]);
    const targetRoleId = await seedRole(orgId, 'rm_audit_target', [
      'product:view',
    ]);
    const adminUserId = await seedUser(
      orgId,
      'rm-audit-admin@pos-erp.local',
      'rm-audit-admin',
      adminRoleId,
    );
    const targetUserId = await seedUser(
      orgId,
      'rm-audit-target@pos-erp.local',
      'rm-audit-target',
      targetRoleId,
    );
    // removeRoleFromUser() unconditionally resolves Organization.ownerUserId (owner-lockout
    // invariant, RbacService.getOwnerUserId() — T052.03B) before comparing it to the removal
    // target; an org with no resolvable owner throws by design (confirmed the hard way against
    // real CI: 500 instead of 204). Every RBAC E2E fixture since T052.03B sets this.
    await prisma.organization.update({
      where: { id: orgId },
      data: { ownerUserId: adminUserId },
    });
    const adminToken = await signToken(adminUserId, orgId);

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: targetUserId },
    });
    const auditCountBefore = await countRemoveAuditRows(
      orgId,
      targetUserId,
      targetRoleId,
    );

    await request(app.getHttpServer())
      .delete(`/api/v1/roles/${targetRoleId}/users/${targetUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    const assignment = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: targetUserId, roleId: targetRoleId } },
    });
    expect(assignment).toBeNull();

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: targetUserId },
    });
    expect(after.permissionVersion).toBe(before.permissionVersion + 1);

    const auditCountAfter = await countRemoveAuditRows(
      orgId,
      targetUserId,
      targetRoleId,
    );
    expect(auditCountAfter).toBe(auditCountBefore + 1);
    expect(auditCountAfter).toBe(1);

    const auditRow = await prisma.auditLog.findFirst({
      where: {
        organizationId: orgId,
        action: 'user.role.remove',
        entityType: 'User',
        entityId: targetUserId,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow?.userId).toBe(adminUserId);
    expect(auditRow?.oldValue).toEqual({ roleId: targetRoleId });
  });

  it('CASE B — owner protection rejection: no UserRole mutation, no permissionVersion increment, zero new audit-success row', async () => {
    const orgId = await seedOrganization(
      'rbac-remove-audit-b',
      'ORG-RM-AUDIT-B',
    );
    const ownerRoleId = await seedRole(orgId, 'rm_audit_owner_role', [
      'role:view',
      'role:update',
      'user:update',
    ]);
    const ownerUserId = await seedUser(
      orgId,
      'rm-audit-owner@pos-erp.local',
      'rm-audit-owner',
      ownerRoleId,
    );
    await prisma.organization.update({
      where: { id: orgId },
      data: { ownerUserId },
    });
    const ownerToken = await signToken(ownerUserId, orgId);

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: ownerUserId },
    });
    const auditCountBefore = await countRemoveAuditRows(
      orgId,
      ownerUserId,
      ownerRoleId,
    );

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/roles/${ownerRoleId}/users/${ownerUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);
    expect(res.body.code).toBe('RBAC_006');

    const assignment = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: ownerUserId, roleId: ownerRoleId } },
    });
    expect(assignment).not.toBeNull();

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: ownerUserId },
    });
    expect(after.permissionVersion).toBe(before.permissionVersion);

    const auditCountAfter = await countRemoveAuditRows(
      orgId,
      ownerUserId,
      ownerRoleId,
    );
    expect(auditCountAfter).toBe(auditCountBefore);
    expect(auditCountAfter).toBe(0);
  });

  it('CASE C — cross-tenant rejection: no audit-success row, no foreign identifiers persisted', async () => {
    const orgAId = await seedOrganization(
      'rbac-remove-audit-c-a',
      'ORG-RM-AUDIT-C-A',
    );
    const orgBId = await seedOrganization(
      'rbac-remove-audit-c-b',
      'ORG-RM-AUDIT-C-B',
    );

    const orgAAdminRoleId = await seedRole(orgAId, 'rm_audit_c_admin', [
      'role:view',
      'user:update',
    ]);
    const orgAAdminUserId = await seedUser(
      orgAId,
      'rm-audit-c-admin@pos-erp.local',
      'rm-audit-c-admin',
      orgAAdminRoleId,
    );
    const orgBRoleId = await seedRole(orgBId, 'rm_audit_c_org_b_role', [
      'product:view',
    ]);
    const orgBUserId = await seedUser(
      orgBId,
      'rm-audit-c-org-b-user@pos-erp.local',
      'rm-audit-c-org-b-user',
      orgBRoleId,
    );
    const orgAToken = await signToken(orgAAdminUserId, orgAId);

    // Attempt 1: Org A actor, Org A's own role, but Org B's user (cross-tenant target).
    const res1 = await request(app.getHttpServer())
      .delete(`/api/v1/roles/${orgAAdminRoleId}/users/${orgBUserId}`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .expect(404);
    expect(res1.body.code).toBe('RBAC_005');

    // Attempt 2: Org A actor, Org B's role, Org A's own user (cross-tenant role).
    const res2 = await request(app.getHttpServer())
      .delete(`/api/v1/roles/${orgBRoleId}/users/${orgAAdminUserId}`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .expect(404);
    expect(res2.body.code).toBe('RBAC_001');

    // Neither cross-tenant attempt left ANY 'user.role.remove' row in Org A's audit trail — no
    // success record, and no Org B identifier (orgBUserId/orgBRoleId) ever appears in it.
    const orgAAuditRows = await prisma.auditLog.findMany({
      where: { organizationId: orgAId, action: 'user.role.remove' },
    });
    expect(orgAAuditRows).toHaveLength(0);

    const orgBUserRoleStillIntact = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: orgBUserId, roleId: orgBRoleId } },
    });
    expect(orgBUserRoleStillIntact).not.toBeNull();
  });
});
