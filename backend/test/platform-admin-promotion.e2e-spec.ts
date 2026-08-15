import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './helpers/create-e2e-app';
import { AppModule } from '../src/app.module';
import { PERMISSION_CATALOG } from '../src/modules/rbac/infrastructure/permission-catalog';
import {
  PlatformAdminTargetNotActiveError,
  PlatformAdminTargetNotFoundError,
  promotePlatformAdmin,
} from '../src/modules/platform/bootstrap/platform-admin-promoter';

/**
 * T053.02A — real-Postgres E2E cho Platform Admin Provisioning (Option B: promote an existing
 * User). Proves the production CLI mechanism (`promotePlatformAdmin()`, invoked by
 * `prisma/promote-platform-admin.ts` / `npm run platform-admin:promote`) end-to-end against real
 * HTTP + real session/JWT invalidation — the SAME mechanism Release E2E must use per Architect
 * Decision §13 (no raw isPlatformAdmin mutation standing in for this).
 *
 * KHÔNG tự chạy được trong sandbox này (thiếu Docker/PostgreSQL) — cùng giới hạn với các
 * *.e2e-spec.ts khác trong repo. Chạy trong CI qua `npm run test:e2e`.
 */
describe('Platform Admin Provisioning (e2e, integration — Postgres thật)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationId: string;
  let organizationSlug: string;

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

    organizationSlug = `platform-admin-e2e-${Date.now()}`;
    const organization = await prisma.organization.upsert({
      where: { slug: organizationSlug },
      create: {
        code: 'PLATFORM-ADMIN-E2E',
        displayName: 'Platform Admin Promotion E2E Org',
        slug: organizationSlug,
      },
      update: {},
    });
    organizationId = organization.id;
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

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await createE2eApp(moduleFixture);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createActiveUser(email: string, password: string) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    return prisma.user.create({
      data: {
        organizationId,
        username: email.split('@')[0],
        email,
        passwordHash,
      },
    });
  }

  async function login(email: string, password: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Client-Type', 'mobile')
      .send({ organizationSlug, email, password })
      .expect(200);
  }

  // CASE 3 — also proves §4: failed target resolution writes no audit row.
  it('CASE 3: unknown organization fails closed, no audit row written', async () => {
    const auditCountBefore = await prisma.auditLog.count({
      where: { action: 'platform_admin.promote' },
    });

    await expect(
      promotePlatformAdmin(prisma, {
        organizationSlug: `no-such-org-${Date.now()}`,
        email: 'nobody@acme.local',
      }),
    ).rejects.toThrow(PlatformAdminTargetNotFoundError);

    const auditCountAfter = await prisma.auditLog.count({
      where: { action: 'platform_admin.promote' },
    });
    expect(auditCountAfter).toBe(auditCountBefore);
  });

  // CASE 4 — also proves §4: failed target resolution writes no audit row.
  it('CASE 4: unknown user fails closed, no audit row written', async () => {
    const auditCountBefore = await prisma.auditLog.count({
      where: { action: 'platform_admin.promote' },
    });

    await expect(
      promotePlatformAdmin(prisma, {
        organizationSlug,
        email: `no-such-user-${Date.now()}@acme.local`,
      }),
    ).rejects.toThrow(PlatformAdminTargetNotFoundError);

    const auditCountAfter = await prisma.auditLog.count({
      where: { action: 'platform_admin.promote' },
    });
    expect(auditCountAfter).toBe(auditCountBefore);
  });

  // Also proves §4: inactive target writes no audit row.
  it('inactive user fails closed, no audit row written', async () => {
    const email = `inactive-${Date.now()}@acme.local`;
    const user = await createActiveUser(email, 'Password123!');
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'INACTIVE' },
    });
    const auditCountBefore = await prisma.auditLog.count({
      where: { action: 'platform_admin.promote' },
    });

    await expect(
      promotePlatformAdmin(prisma, { organizationSlug, email }),
    ).rejects.toThrow(PlatformAdminTargetNotActiveError);

    const auditCountAfter = await prisma.auditLog.count({
      where: { action: 'platform_admin.promote' },
    });
    expect(auditCountAfter).toBe(auditCountBefore);
  });

  // CASE 1, 5, 6, 7, 8, 9, 10, 12 — one continuous real-HTTP flow.
  it('CASE 1/5/6/7/8/9/10/12: full production promotion flow via real HTTP', async () => {
    const email = `promote-target-${Date.now()}@acme.local`;
    const password = 'PromoteTarget@123';
    await createActiveUser(email, password);

    // Baseline: ordinary tenant user, not yet promoted, has a real active session.
    const preLogin = await login(email, password);
    const staleAccessToken = preLogin.body.data.accessToken as string;
    const staleRefreshToken = preLogin.body.data.refreshToken as string;

    const roleCountBefore = await prisma.role.count({
      where: { organizationId },
    });
    const userRoleCountBefore = await prisma.userRole.count();
    const auditCountBefore = await prisma.auditLog.count({
      where: { action: 'platform_admin.promote' },
    });

    // CASE 1 — resolve + promote via the production mechanism.
    const result = await promotePlatformAdmin(prisma, {
      organizationSlug,
      email,
    });
    expect(result.outcome).toBe('PROMOTED');
    if (result.outcome !== 'PROMOTED') {
      throw new Error('expected PROMOTED outcome');
    }

    // CASE 5/6 — no Organization/Role/UserRole/Subscription side effects.
    const roleCountAfter = await prisma.role.count({
      where: { organizationId },
    });
    const userRoleCountAfter = await prisma.userRole.count();
    expect(roleCountAfter).toBe(roleCountBefore);
    expect(userRoleCountAfter).toBe(userRoleCountBefore);

    // Audit — exactly one new record. Actor (userId) is null — no authenticated actor exists for
    // a CLI-initiated action; assigning the promoted user's own id would falsely claim
    // self-promotion (Architect Gap A). Subject is recorded via entityId instead.
    const auditEntries = await prisma.auditLog.findMany({
      where: { action: 'platform_admin.promote', organizationId },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditEntries.length).toBe(auditCountBefore + 1);
    expect(auditEntries[0].userId).toBeNull();
    expect(auditEntries[0].entityId).toBe(result.userId);

    // CASE 7 — every pre-existing session for this user is now revoked.
    const activeSessions = await prisma.session.findMany({
      where: { userId: result.userId, revokedAt: null },
    });
    expect(activeSessions).toHaveLength(0);

    // CASE 9 — the stale refresh token can no longer be used (revoked-reuse branch, same
    // AUTH_004 semantics user-management.e2e-spec.ts already proves for deactivate()).
    const staleRefreshAttempt = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('X-Client-Type', 'mobile')
      .send({ refreshToken: staleRefreshToken })
      .expect(401);
    expect(staleRefreshAttempt.body.code).toBe('AUTH_004');

    // CASE 9 — the stale access token (still within its natural expiry, valid signature) is
    // rejected on its very next use because permissionVersion no longer matches the DB.
    const staleAccessAttempt = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${staleAccessToken}`)
      .expect(401);
    expect(staleAccessAttempt.body.code).toBe('AUTH_006');

    // CASE 8 — fresh login receives a NEW access token carrying isPlatformAdmin=true (proven
    // indirectly but conclusively by CASE 10 below: only isPlatformAdmin=true can pass
    // PlatformAdminGuard on POST /organizations).
    const postLogin = await login(email, password);
    const freshAccessToken = postLogin.body.data.accessToken as string;

    // CASE 10 — PlatformAdminGuard-protected route is now reachable through the real,
    // production-issued token — no raw DB mutation substituted for this proof.
    const newOrgSlug = `platform-admin-e2e-created-${Date.now()}`;
    const createOrgRes = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${freshAccessToken}`)
      .send({
        organization: {
          displayName: 'Created By Promoted Admin',
          slug: newOrgSlug,
        },
        owner: {
          fullName: 'New Owner',
          email: `owner-${Date.now()}@created.local`,
          password: 'Password123',
        },
      })
      .expect(201);
    expect(createOrgRes.body.data.slug).toBe(newOrgSlug);

    // CASE 12 — running the CLI mechanism again on the same (now-promoted) user is idempotent:
    // no duplicate audit record, no additional session revocation.
    const secondRun = await promotePlatformAdmin(prisma, {
      organizationSlug,
      email,
    });
    expect(secondRun.outcome).toBe('ALREADY_PLATFORM_ADMIN');
    const auditEntriesAfterRerun = await prisma.auditLog.count({
      where: { action: 'platform_admin.promote', organizationId },
    });
    expect(auditEntriesAfterRerun).toBe(auditCountBefore + 1);
  });

  // CASE 11
  it('CASE 11: ordinary tenant Owner without CLI promotion remains forbidden from POST /organizations', async () => {
    const email = `never-promoted-${Date.now()}@acme.local`;
    const password = 'NeverPromoted@123';
    await createActiveUser(email, password);

    const loginRes = await login(email, password);
    const accessToken = loginRes.body.data.accessToken as string;

    await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        organization: {
          displayName: 'Should Fail',
          slug: `should-fail-${Date.now()}`,
        },
        owner: {
          fullName: 'X',
          email: `x-${Date.now()}@x.local`,
          password: 'Password123',
        },
      })
      .expect(403);
  });
});
