import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  UserEmailConflictError,
  UserUsernameConflictError,
} from '../../domain/repositories/user.repository.interface';
import { PrismaUserRepository } from './prisma-user.repository';

const rawUser = {
  id: 'user-1',
  organizationId: 'org-1',
  branchId: null,
  username: 'staff01',
  fullName: 'Nhân viên 01',
  email: 'staff01@acme.test',
  phone: null,
  avatar: null,
  status: 'ACTIVE',
  lastLoginAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function makeP2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

describe('PrismaUserRepository', () => {
  let repository: PrismaUserRepository;
  let prisma: {
    user: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    repository = new PrismaUserRepository(prisma as unknown as PrismaService);
  });

  describe('findById', () => {
    it('scope theo id + organizationId, cross-tenant/không tồn tại trả về null', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await repository.findById('user-1', 'org-2');

      expect(result).toBeNull();
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1', organizationId: 'org-2', deletedAt: null },
        }),
      );
    });

    it('trả về entity khi tìm thấy đúng tổ chức', async () => {
      prisma.user.findFirst.mockResolvedValue(rawUser);

      const result = await repository.findById('user-1', 'org-1');

      expect(result?.username).toBe('staff01');
    });
  });

  describe('search', () => {
    it('scope theo organizationId, trả về danh sách + total', async () => {
      prisma.$transaction.mockResolvedValue([[rawUser], 1]);

      const result = await repository.search({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
      });

      expect(result.total).toBe(1);
      expect(result.items[0].username).toBe('staff01');
    });
  });

  describe('existsByUsername / existsByEmail', () => {
    it('existsByUsername scope theo organizationId', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });

      const result = await repository.existsByUsername('org-1', 'staff01');

      expect(result).toBe(true);
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', username: 'staff01' },
        }),
      );
    });

    it('existsByEmail trả về false khi không tìm thấy', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        repository.existsByEmail('org-1', 'nobody@acme.test'),
      ).resolves.toBe(false);
    });
  });

  describe('create', () => {
    const input = {
      organizationId: 'org-1',
      username: 'staff01',
      email: 'staff01@acme.test',
      passwordHash: 'hashed',
      createdBy: 'admin-1',
    };

    it('tạo user thành công, status luôn ACTIVE', async () => {
      prisma.user.create.mockResolvedValue(rawUser);

      const result = await repository.create(input);

      expect(result.id).toBe('user-1');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });

    it('map P2002 trên username sang UserUsernameConflictError', async () => {
      prisma.user.create.mockRejectedValue(
        makeP2002(['organizationId', 'username']),
      );

      await expect(repository.create(input)).rejects.toThrow(
        UserUsernameConflictError,
      );
    });

    it('map P2002 trên email sang UserEmailConflictError', async () => {
      prisma.user.create.mockRejectedValue(
        makeP2002(['organizationId', 'email']),
      );

      await expect(repository.create(input)).rejects.toThrow(
        UserEmailConflictError,
      );
    });
  });

  describe('update / updateStatus / updatePasswordHash', () => {
    it('update chỉ ghi các field cho phép, không đụng organizationId/username/email/status', async () => {
      prisma.user.update.mockResolvedValue(rawUser);

      await repository.update('user-1', 'org-1', {
        fullName: 'Mới',
        updatedBy: 'admin-1',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          branchId: undefined,
          fullName: 'Mới',
          phone: undefined,
          avatar: undefined,
          updatedBy: 'admin-1',
        },
        select: expect.any(Object),
      });
    });

    it('updateStatus ghi đúng status mới', async () => {
      prisma.user.update.mockResolvedValue({ ...rawUser, status: 'INACTIVE' });

      const result = await repository.updateStatus(
        'user-1',
        'org-1',
        'INACTIVE',
        'admin-1',
      );

      expect(result.status).toBe('INACTIVE');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'INACTIVE', updatedBy: 'admin-1' },
        }),
      );
    });

    it('updatePasswordHash chỉ ghi passwordHash + updatedBy, không trả dữ liệu user', async () => {
      prisma.user.update.mockResolvedValue(rawUser);

      await repository.updatePasswordHash(
        'user-1',
        'org-1',
        'new-hash',
        'admin-1',
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: 'new-hash', updatedBy: 'admin-1' },
      });
    });
  });
});
