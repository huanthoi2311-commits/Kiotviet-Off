import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UsageLimitService } from '../../../usage-limit/application/usage-limit.service';
import { PrismaWarehouseRepository } from './prisma-warehouse.repository';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

describe('PrismaWarehouseRepository', () => {
  let repository: PrismaWarehouseRepository;
  let prisma: {
    warehouse: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    inventory: { findFirst: jest.Mock };
    inventoryMovement: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let usageLimit: jest.Mocked<Pick<UsageLimitService, 'lock' | 'getLimit'>>;

  const rawWarehouse = {
    id: 'wh-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    managerId: null,
    code: 'KHO-01',
    name: 'Kho Chính',
    type: 'MAIN',
    address: null,
    phone: null,
    email: null,
    description: null,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
  };

  beforeEach(() => {
    prisma = {
      warehouse: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      inventory: { findFirst: jest.fn() },
      inventoryMovement: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    usageLimit = {
      lock: jest.fn().mockResolvedValue(undefined),
      getLimit: jest.fn().mockResolvedValue(null),
    };
    repository = new PrismaWarehouseRepository(
      prisma as unknown as PrismaService,
      usageLimit as unknown as UsageLimitService,
    );
  });

  describe('create', () => {
    const input = {
      organizationId: 'org-1',
      branchId: 'branch-1',
      code: 'KHO-01',
      name: 'Kho Chính',
      createdBy: 'user-1',
    };

    function makeCreateTx(overrides: { count?: number } = {}) {
      const client = {
        warehouse: {
          count: jest.fn().mockResolvedValue(overrides.count ?? 0),
          create: jest.fn().mockResolvedValue(rawWarehouse),
        },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(client),
      );
      return client;
    }

    it('tạo thành công (limit null — không giới hạn)', async () => {
      makeCreateTx();
      const result = await repository.create(input);
      expect(result.code).toBe('KHO-01');
    });

    it('dịch lỗi P2002 sang ConflictException', async () => {
      const tx = makeCreateTx();
      tx.warehouse.create.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(repository.create(input)).rejects.toThrow(ConflictException);
    });

    it('dịch lỗi P2003 sang BadRequestException', async () => {
      const tx = makeCreateTx();
      tx.warehouse.create.mockRejectedValue(
        knownError('P2003', { field_name: 'branchId' }),
      );
      await expect(repository.create(input)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('ném thẳng lỗi không xác định', async () => {
      const tx = makeCreateTx();
      tx.warehouse.create.mockRejectedValue(new Error('boom'));
      await expect(repository.create(input)).rejects.toThrow('boom');
    });

    it('T053.05B — thứ tự bắt buộc LOCK → đọc limit → COUNT(deletedAt IS NULL) → INSERT', async () => {
      const tx = makeCreateTx({ count: 0 });
      const callOrder: string[] = [];
      usageLimit.lock.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('lock');
      });
      usageLimit.getLimit.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('getLimit');
        return 1;
      });
      tx.warehouse.count.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('count');
        return 0;
      });
      tx.warehouse.create.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('create');
        return rawWarehouse;
      });

      await repository.create(input);

      expect(callOrder).toEqual(['lock', 'getLimit', 'count', 'create']);
      expect(usageLimit.lock).toHaveBeenCalledWith(tx, 'org-1', 'WAREHOUSE');
      expect(tx.warehouse.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
      });
    });

    it('T053.05B — currentUsage >= limit → 409, tx.warehouse.create KHÔNG được gọi', async () => {
      const tx = makeCreateTx({ count: 1 });
      usageLimit.getLimit.mockResolvedValue(1);
      await expect(repository.create(input)).rejects.toThrow(ConflictException);
      expect(tx.warehouse.create).not.toHaveBeenCalled();
    });
  });

  describe('findById / findByIdIncludingDeleted', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(null);
      await expect(repository.findById('missing', 'org-1')).resolves.toBeNull();
    });

    it('map đúng entity khi tìm thấy', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(rawWarehouse);
      const result = await repository.findById('wh-1', 'org-1');
      expect(result?.code).toBe('KHO-01');
    });

    it('findByIdIncludingDeleted không lọc deletedAt', async () => {
      prisma.warehouse.findFirst.mockResolvedValue({
        ...rawWarehouse,
        deletedAt: new Date(),
      });
      const result = await repository.findByIdIncludingDeleted('wh-1', 'org-1');
      expect(result?.deletedAt).not.toBeNull();
      expect(prisma.warehouse.findFirst).toHaveBeenCalledWith({
        where: { id: 'wh-1', organizationId: 'org-1' },
      });
    });
  });

  describe('update', () => {
    it('cập nhật thành công', async () => {
      prisma.warehouse.update.mockResolvedValue({
        ...rawWarehouse,
        name: 'Kho mới',
      });
      const result = await repository.update('wh-1', {
        name: 'Kho mới',
        updatedBy: 'user-1',
      });
      expect(result.name).toBe('Kho mới');
    });

    it('dịch lỗi P2002 khi trùng code', async () => {
      prisma.warehouse.update.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(
        repository.update('wh-1', { name: 'x', updatedBy: 'user-1' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('softDelete', () => {
    it('softDelete set deletedAt và updatedBy', async () => {
      prisma.warehouse.update.mockResolvedValue(rawWarehouse);
      await repository.softDelete('wh-1', 'user-1');
      expect(prisma.warehouse.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wh-1' },
          data: expect.objectContaining({ updatedBy: 'user-1' }),
        }),
      );
    });
  });

  describe('restore (T053.05B — quota-increasing, cùng khoá WAREHOUSE với create)', () => {
    function makeRestoreTx(overrides: { count?: number } = {}) {
      const client = {
        warehouse: {
          count: jest.fn().mockResolvedValue(overrides.count ?? 0),
          update: jest.fn().mockResolvedValue(rawWarehouse),
        },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(client),
      );
      return client;
    }

    it('restore clear deletedAt (limit null — không giới hạn)', async () => {
      const tx = makeRestoreTx();
      await repository.restore('wh-1', 'org-1', 'user-1');
      expect(tx.warehouse.update).toHaveBeenCalledWith({
        where: { id: 'wh-1' },
        data: { deletedAt: null, updatedBy: 'user-1' },
      });
    });

    it('T053.05B — dùng CÙNG khoá logic (organizationId, WAREHOUSE) như create()', async () => {
      makeRestoreTx();
      await repository.restore('wh-1', 'org-1', 'user-1');
      expect(usageLimit.lock).toHaveBeenCalledWith(
        expect.anything(),
        'org-1',
        'WAREHOUSE',
      );
    });

    it('T053.05B — thứ tự bắt buộc LOCK → đọc limit → COUNT → UPDATE(deletedAt:null)', async () => {
      const tx = makeRestoreTx({ count: 0 });
      const callOrder: string[] = [];
      usageLimit.lock.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('lock');
      });
      usageLimit.getLimit.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('getLimit');
        return 1;
      });
      tx.warehouse.count.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('count');
        return 0;
      });
      tx.warehouse.update.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('update');
        return rawWarehouse;
      });

      await repository.restore('wh-1', 'org-1', 'user-1');

      expect(callOrder).toEqual(['lock', 'getLimit', 'count', 'update']);
      expect(tx.warehouse.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
      });
    });

    it('T053.05B — currentUsage >= limit → 409, tx.warehouse.update (restore) KHÔNG được gọi, deletedAt giữ nguyên', async () => {
      const tx = makeRestoreTx({ count: 1 });
      usageLimit.getLimit.mockResolvedValue(1);
      await expect(
        repository.restore('wh-1', 'org-1', 'user-1'),
      ).rejects.toThrow(ConflictException);
      expect(tx.warehouse.update).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('trả về danh sách phân trang', async () => {
      prisma.$transaction.mockResolvedValue([[rawWarehouse], 1]);
      const result = await repository.search({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('thêm điều kiện OR khi có search text', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await repository.search({
        organizationId: 'org-1',
        search: 'kho',
        page: 1,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'asc',
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('mặc định (không truyền archived) lọc deletedAt=null (T044.05)', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await repository.search({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'asc',
      });
      expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    it('archived=false lọc deletedAt=null (T044.05)', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await repository.search({
        organizationId: 'org-1',
        archived: false,
        page: 1,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'asc',
      });
      expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    it('archived=true lọc deletedAt IS NOT NULL — cho phép tìm lại kho đã xóa để khôi phục (T044.05)', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await repository.search({
        organizationId: 'org-1',
        archived: true,
        page: 1,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'asc',
      });
      expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: { not: null } }),
        }),
      );
    });
  });

  describe('existsByCode', () => {
    it('true khi tìm thấy', async () => {
      prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh-1' });
      await expect(repository.existsByCode('org-1', 'KHO-01')).resolves.toBe(
        true,
      );
    });

    it('loại trừ excludeId khỏi điều kiện tìm kiếm', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(null);
      await repository.existsByCode('org-1', 'KHO-01', 'wh-1');
      expect(prisma.warehouse.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', code: 'KHO-01', id: { not: 'wh-1' } },
        select: { id: true },
      });
    });
  });

  describe('hasStockOrTransactions', () => {
    it('false khi không có tồn kho và không có lịch sử giao dịch', async () => {
      prisma.inventory.findFirst.mockResolvedValue(null);
      prisma.inventoryMovement.findFirst.mockResolvedValue(null);
      await expect(repository.hasStockOrTransactions('wh-1')).resolves.toBe(
        false,
      );
    });

    it('true khi còn tồn kho khác 0', async () => {
      prisma.inventory.findFirst.mockResolvedValue({ id: 'inv-1' });
      prisma.inventoryMovement.findFirst.mockResolvedValue(null);
      await expect(repository.hasStockOrTransactions('wh-1')).resolves.toBe(
        true,
      );
    });

    it('true khi còn lịch sử giao dịch', async () => {
      prisma.inventory.findFirst.mockResolvedValue(null);
      prisma.inventoryMovement.findFirst.mockResolvedValue({ id: 'hist-1' });
      await expect(repository.hasStockOrTransactions('wh-1')).resolves.toBe(
        true,
      );
    });
  });
});
