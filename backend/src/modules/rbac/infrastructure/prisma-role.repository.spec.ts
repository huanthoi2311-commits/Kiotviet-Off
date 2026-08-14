import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaRoleRepository } from './prisma-role.repository';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

describe('PrismaRoleRepository', () => {
  let repository: PrismaRoleRepository;
  let prisma: {
    role: { create: jest.Mock };
    organization: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      role: { create: jest.fn() },
      organization: { findUnique: jest.fn() },
    };
    repository = new PrismaRoleRepository(prisma as unknown as PrismaService);
  });

  describe('create (T052.03B D7 — race-safety fallback)', () => {
    const input = {
      organizationId: 'org-1',
      code: 'sales_staff',
      name: 'Nhân viên bán hàng',
    };

    it('dịch lỗi P2002 (race giữa 2 request đồng thời cùng code) sang ConflictException/RBAC_002', async () => {
      prisma.role.create.mockRejectedValue(
        knownError('P2002', { target: ['organizationId', 'code'] }),
      );
      await expect(repository.create(input)).rejects.toThrow(ConflictException);
    });

    it('ném thẳng lỗi không xác định, không nuốt lỗi khác P2002', async () => {
      prisma.role.create.mockRejectedValue(new Error('boom'));
      await expect(repository.create(input)).rejects.toThrow('boom');
    });
  });

  describe('findOrganizationOwnerUserId (T052.03B — RBAC POLICY READ PORT)', () => {
    it('trả về ownerUserId khi Organization tồn tại và có owner', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        ownerUserId: 'owner-1',
      });

      const result = await repository.findOrganizationOwnerUserId('org-1');

      expect(result).toBe('owner-1');
      expect(prisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        select: { ownerUserId: true },
      });
    });

    it('trả về null khi Organization không tồn tại', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      await expect(
        repository.findOrganizationOwnerUserId('missing-org'),
      ).resolves.toBeNull();
    });

    it('trả về null khi Organization tồn tại nhưng ownerUserId null (cửa sổ bootstrap)', async () => {
      prisma.organization.findUnique.mockResolvedValue({ ownerUserId: null });
      await expect(
        repository.findOrganizationOwnerUserId('org-1'),
      ).resolves.toBeNull();
    });
  });
});
