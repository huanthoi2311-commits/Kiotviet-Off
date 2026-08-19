import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UsageLimitService } from '../../../usage-limit/application/usage-limit.service';
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
  let usageLimit: jest.Mocked<Pick<UsageLimitService, 'lock' | 'getLimit'>>;

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
    usageLimit = {
      lock: jest.fn().mockResolvedValue(undefined),
      getLimit: jest.fn().mockResolvedValue(null),
    };
    repository = new PrismaUserRepository(
      prisma as unknown as PrismaService,
      usageLimit as unknown as UsageLimitService,
    );
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

    /** T053.05B — create() giờ chạy trong $transaction; mô phỏng đúng interactive-callback API
     * (cùng pattern đã dùng ở prisma-organization.repository.spec.ts). */
    function makeTx(overrides: { count?: number } = {}) {
      return {
        user: {
          count: jest.fn().mockResolvedValue(overrides.count ?? 0),
          create: jest.fn().mockResolvedValue(rawUser),
        },
      };
    }

    it('tạo user thành công, status luôn ACTIVE (limit null — không giới hạn)', async () => {
      const tx = makeTx();
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(tx),
      );

      const result = await repository.create(input);

      expect(result.id).toBe('user-1');
      expect(tx.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });

    it('T053.05B — thứ tự bắt buộc: LOCK → đọc limit → COUNT → INSERT (limit không null)', async () => {
      const tx = makeTx({ count: 1 });
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(tx),
      );
      const callOrder: string[] = [];
      usageLimit.lock.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('lock');
      });
      usageLimit.getLimit.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('getLimit');
        return 3;
      });
      tx.user.count.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('count');
        return 1;
      });
      tx.user.create.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('create');
        return rawUser;
      });

      await repository.create(input);

      expect(callOrder).toEqual(['lock', 'getLimit', 'count', 'create']);
      expect(usageLimit.lock).toHaveBeenCalledWith(tx, 'org-1', 'USER');
      expect(tx.user.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
      });
    });

    it('T053.05B — limit=null (unlimited) → KHÔNG gọi COUNT, vẫn tạo thành công', async () => {
      usageLimit.getLimit.mockResolvedValue(null);
      const tx = makeTx();
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(tx),
      );

      await repository.create(input);

      expect(tx.user.count).not.toHaveBeenCalled();
      expect(tx.user.create).toHaveBeenCalled();
    });

    it('T053.05B — currentUsage >= limit → SUBSCRIPTION_USAGE_LIMIT_REACHED (409), tx.user.create KHÔNG được gọi', async () => {
      usageLimit.getLimit.mockResolvedValue(3);
      const tx = makeTx({ count: 3 });
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(tx),
      );

      await expect(repository.create(input)).rejects.toThrow(ConflictException);
      expect(tx.user.create).not.toHaveBeenCalled();
    });

    it('map P2002 trên username sang UserUsernameConflictError', async () => {
      const tx = makeTx();
      tx.user.create.mockRejectedValue(
        makeP2002(['organizationId', 'username']),
      );
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(tx),
      );

      await expect(repository.create(input)).rejects.toThrow(
        UserUsernameConflictError,
      );
    });

    it('map P2002 trên email sang UserEmailConflictError', async () => {
      const tx = makeTx();
      tx.user.create.mockRejectedValue(makeP2002(['organizationId', 'email']));
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(tx),
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
