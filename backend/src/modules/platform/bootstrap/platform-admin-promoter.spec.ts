import {
  PlatformAdminTargetNotActiveError,
  PlatformAdminTargetNotFoundError,
  promotePlatformAdmin,
} from './platform-admin-promoter';

describe('promotePlatformAdmin (T053.02A)', () => {
  let prisma: {
    organization: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock; update: jest.Mock };
    session: { updateMany: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  const organization = { id: 'org-1', slug: 'acme' };
  const activeUser = {
    id: 'user-1',
    organizationId: 'org-1',
    email: 'owner@acme.com',
    status: 'ACTIVE',
    isPlatformAdmin: false,
  };

  beforeEach(() => {
    prisma = {
      organization: { findUnique: jest.fn() },
      user: { findUnique: jest.fn(), update: jest.fn() },
      session: { updateMany: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
  });

  // CASE 1
  it('CASE 1: resolves existing User by organizationSlug + email and promotes successfully', async () => {
    prisma.organization.findUnique.mockResolvedValue(organization);
    prisma.user.findUnique.mockResolvedValue(activeUser);

    const result = await promotePlatformAdmin(prisma as never, {
      organizationSlug: 'acme',
      email: 'owner@acme.com',
    });

    expect(result).toEqual({
      outcome: 'PROMOTED',
      userId: 'user-1',
      organizationId: 'org-1',
    });
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { slug: 'acme' },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: {
        organizationId_email: {
          organizationId: 'org-1',
          email: 'owner@acme.com',
        },
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  // CASE 2
  it('CASE 2: already-platform-admin rerun is idempotent — no transaction opened', async () => {
    prisma.organization.findUnique.mockResolvedValue(organization);
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      isPlatformAdmin: true,
    });

    const result = await promotePlatformAdmin(prisma as never, {
      organizationSlug: 'acme',
      email: 'owner@acme.com',
    });

    expect(result).toEqual({
      outcome: 'ALREADY_PLATFORM_ADMIN',
      userId: 'user-1',
      organizationId: 'org-1',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // CASE 3
  it('CASE 3: unknown organization fails closed', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);

    await expect(
      promotePlatformAdmin(prisma as never, {
        organizationSlug: 'does-not-exist',
        email: 'owner@acme.com',
      }),
    ).rejects.toThrow(PlatformAdminTargetNotFoundError);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // CASE 4
  it('CASE 4: unknown user fails closed', async () => {
    prisma.organization.findUnique.mockResolvedValue(organization);
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      promotePlatformAdmin(prisma as never, {
        organizationSlug: 'acme',
        email: 'no-such-user@acme.com',
      }),
    ).rejects.toThrow(PlatformAdminTargetNotFoundError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('inactive user fails closed with a distinct error', async () => {
    prisma.organization.findUnique.mockResolvedValue(organization);
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      status: 'INACTIVE',
    });

    await expect(
      promotePlatformAdmin(prisma as never, {
        organizationSlug: 'acme',
        email: 'owner@acme.com',
      }),
    ).rejects.toThrow(PlatformAdminTargetNotActiveError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // CASE 5 / CASE 6
  it('CASE 5/6: only user/session/auditLog are touched inside the transaction — no Organization/Role/UserRole/Subscription side effects', async () => {
    prisma.organization.findUnique.mockResolvedValue(organization);
    prisma.user.findUnique.mockResolvedValue(activeUser);

    await promotePlatformAdmin(prisma as never, {
      organizationSlug: 'acme',
      email: 'owner@acme.com',
    });

    const transactionArg = prisma.$transaction.mock.calls[0][0] as unknown[];
    expect(transactionArg).toHaveLength(3);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { isPlatformAdmin: true, permissionVersion: { increment: 1 } },
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        // Actor — no authenticated actor exists for a CLI-initiated action. null is the
        // schema-designed "no actor" state (AuditLog.userId is nullable, onDelete: SetNull),
        // matching the established convention (prisma-organization.repository.ts's
        // `userId: actorUserId` for organization.created) where userId always means ACTOR, never
        // subject — assigning the promoted user's own id here would falsely claim self-promotion.
        userId: null,
        action: 'platform_admin.promote',
        entityType: 'User',
        // Subject — the User being promoted, kept separate from actor via entityId.
        entityId: 'user-1',
        oldValue: { isPlatformAdmin: false },
        newValue: { isPlatformAdmin: true, promotedVia: 'cli' },
      }),
    });
  });

  it('no audit row is written when target resolution fails (unknown organization)', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);

    await expect(
      promotePlatformAdmin(prisma as never, {
        organizationSlug: 'does-not-exist',
        email: 'owner@acme.com',
      }),
    ).rejects.toThrow(PlatformAdminTargetNotFoundError);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('no audit row is written when target resolution fails (unknown user)', async () => {
    prisma.organization.findUnique.mockResolvedValue(organization);
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      promotePlatformAdmin(prisma as never, {
        organizationSlug: 'acme',
        email: 'no-such-user@acme.com',
      }),
    ).rejects.toThrow(PlatformAdminTargetNotFoundError);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('no audit row is written when the target is inactive', async () => {
    prisma.organization.findUnique.mockResolvedValue(organization);
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      status: 'INACTIVE',
    });

    await expect(
      promotePlatformAdmin(prisma as never, {
        organizationSlug: 'acme',
        email: 'owner@acme.com',
      }),
    ).rejects.toThrow(PlatformAdminTargetNotActiveError);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('no additional audit row is written on an idempotent (already-promoted) rerun', async () => {
    prisma.organization.findUnique.mockResolvedValue(organization);
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      isPlatformAdmin: true,
    });

    await promotePlatformAdmin(prisma as never, {
      organizationSlug: 'acme',
      email: 'owner@acme.com',
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('transaction failure leaves no partial state — a rejected $transaction propagates, no result returned', async () => {
    prisma.organization.findUnique.mockResolvedValue(organization);
    prisma.user.findUnique.mockResolvedValue(activeUser);
    prisma.$transaction.mockRejectedValue(new Error('db unavailable'));

    await expect(
      promotePlatformAdmin(prisma as never, {
        organizationSlug: 'acme',
        email: 'owner@acme.com',
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('permissionVersion is incremented (not reset) — forces re-login without a new schema field', async () => {
    prisma.organization.findUnique.mockResolvedValue(organization);
    prisma.user.findUnique.mockResolvedValue(activeUser);

    await promotePlatformAdmin(prisma as never, {
      organizationSlug: 'acme',
      email: 'owner@acme.com',
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          permissionVersion: { increment: 1 },
        }),
      }),
    );
  });
});
