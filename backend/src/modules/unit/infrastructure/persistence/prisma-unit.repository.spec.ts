import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PrismaUnitRepository } from './prisma-unit.repository';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

describe('PrismaUnitRepository', () => {
  let repository: PrismaUnitRepository;
  let prisma: {
    unit: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const rawUnit = {
    id: 'unit-1',
    organizationId: 'org-1',
    code: 'CAI',
    name: 'Cái',
    symbol: 'cái',
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
  };

  beforeEach(() => {
    prisma = {
      unit: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    repository = new PrismaUnitRepository(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    const input = {
      organizationId: 'org-1',
      code: 'CAI',
      name: 'Cái',
      symbol: 'cái',
      createdBy: 'user-1',
    };

    it('tạo thành công', async () => {
      prisma.unit.create.mockResolvedValue(rawUnit);
      const result = await repository.create(input);
      expect(result.code).toBe('CAI');
    });

    it('dịch lỗi P2002 sang ConflictException', async () => {
      prisma.unit.create.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(repository.create(input)).rejects.toThrow(ConflictException);
    });

    it('ném thẳng lỗi không xác định', async () => {
      prisma.unit.create.mockRejectedValue(new Error('boom'));
      await expect(repository.create(input)).rejects.toThrow('boom');
    });
  });

  describe('findById', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.unit.findFirst.mockResolvedValue(null);
      await expect(repository.findById('missing', 'org-1')).resolves.toBeNull();
    });

    it('map đúng entity khi tìm thấy', async () => {
      prisma.unit.findFirst.mockResolvedValue(rawUnit);
      const result = await repository.findById('unit-1', 'org-1');
      expect(result?.code).toBe('CAI');
      expect(prisma.unit.findFirst).toHaveBeenCalledWith({
        where: { id: 'unit-1', organizationId: 'org-1', deletedAt: null },
      });
    });
  });

  describe('findByIdIncludingDeleted', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.unit.findFirst.mockResolvedValue(null);
      await expect(
        repository.findByIdIncludingDeleted('missing', 'org-1'),
      ).resolves.toBeNull();
    });

    it('trả về entity kể cả đã bị xóa mềm (không lọc deletedAt)', async () => {
      prisma.unit.findFirst.mockResolvedValue({
        ...rawUnit,
        deletedAt: new Date('2026-01-02'),
      });
      const result = await repository.findByIdIncludingDeleted(
        'unit-1',
        'org-1',
      );
      expect(result?.deletedAt).not.toBeNull();
      expect(prisma.unit.findFirst).toHaveBeenCalledWith({
        where: { id: 'unit-1', organizationId: 'org-1' },
      });
    });
  });

  describe('update', () => {
    it('cập nhật thành công khi id/organizationId/version khớp', async () => {
      prisma.unit.updateMany.mockResolvedValue({ count: 1 });
      prisma.unit.findUniqueOrThrow.mockResolvedValue({
        ...rawUnit,
        name: 'Cái (đã sửa)',
        version: 2,
      });
      const result = await repository.update('unit-1', 'org-1', 1, {
        name: 'Cái (đã sửa)',
        updatedBy: 'user-1',
      });
      expect(result.name).toBe('Cái (đã sửa)');
      expect(prisma.unit.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'unit-1', organizationId: 'org-1', version: 1 },
        }),
      );
    });

    it('ném UnitConcurrencyConflictError khi version không khớp', async () => {
      prisma.unit.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.update('unit-1', 'org-1', 1, {
          name: 'x',
          updatedBy: 'user-1',
        }),
      ).rejects.toThrow('vừa bị thay đổi bởi giao dịch khác');
    });

    it('ném UnitConcurrencyConflictError khi organizationId khác (multi-tenant)', async () => {
      prisma.unit.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.update('unit-1', 'org-KHAC', 1, {
          name: 'x',
          updatedBy: 'user-1',
        }),
      ).rejects.toThrow('vừa bị thay đổi bởi giao dịch khác');
    });

    it('dịch lỗi P2002 khi trùng code', async () => {
      prisma.unit.updateMany.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(
        repository.update('unit-1', 'org-1', 1, {
          name: 'x',
          updatedBy: 'user-1',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('softDelete', () => {
    it('set deletedAt, status=ARCHIVED, updatedBy và tăng version, lọc theo organizationId', async () => {
      prisma.unit.updateMany.mockResolvedValue({ count: 1 });
      await repository.softDelete('unit-1', 'org-1', 'user-1');
      expect(prisma.unit.updateMany).toHaveBeenCalledWith({
        where: { id: 'unit-1', organizationId: 'org-1' },
        data: {
          deletedAt: expect.any(Date),
          status: 'ARCHIVED',
          updatedBy: 'user-1',
          version: { increment: 1 },
        },
      });
    });
  });

  describe('restore', () => {
    it('set deletedAt=null, status=INACTIVE, tăng version, lọc theo organizationId', async () => {
      prisma.unit.updateMany.mockResolvedValue({ count: 1 });
      await repository.restore('unit-1', 'org-1', 'user-1');
      expect(prisma.unit.updateMany).toHaveBeenCalledWith({
        where: { id: 'unit-1', organizationId: 'org-1' },
        data: {
          deletedAt: null,
          status: 'INACTIVE',
          updatedBy: 'user-1',
          version: { increment: 1 },
        },
      });
    });
  });

  describe('search', () => {
    const baseParams = {
      organizationId: 'org-1',
      page: 1,
      limit: 20,
      sortBy: 'name' as const,
      sortOrder: 'asc' as const,
    };

    it('trả về danh sách phân trang', async () => {
      prisma.$transaction.mockResolvedValue([[rawUnit], 1]);
      const result = await repository.search(baseParams);
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('thêm điều kiện OR khi có search text', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await repository.search({ ...baseParams, search: 'cai' });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('isActive=true lọc theo status=ACTIVE (không có cột isActive)', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await repository.search({ ...baseParams, isActive: true });
      expect(prisma.unit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ AND: [{ status: 'ACTIVE' }] }),
        }),
      );
    });

    it('status và isActive gửi đồng thời áp dụng AND cả 2 điều kiện', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await repository.search({
        ...baseParams,
        status: 'ACTIVE',
        isActive: false,
      });
      expect(prisma.unit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [{ status: 'ACTIVE' }, { status: { not: 'ACTIVE' } }],
          }),
        }),
      );
    });

    it('orderBy theo sortBy/sortOrder được truyền', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await repository.search({
        ...baseParams,
        sortBy: 'code',
        sortOrder: 'desc',
      });
      expect(prisma.unit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { code: 'desc' } }),
      );
    });
  });

  describe('existsByCode', () => {
    it('true khi tìm thấy', async () => {
      prisma.unit.findFirst.mockResolvedValue({ id: 'unit-1' });
      await expect(repository.existsByCode('org-1', 'CAI')).resolves.toBe(true);
    });

    it('false khi không tìm thấy', async () => {
      prisma.unit.findFirst.mockResolvedValue(null);
      await expect(repository.existsByCode('org-1', 'CAI')).resolves.toBe(
        false,
      );
    });

    it('loại trừ excludeId khỏi điều kiện tìm kiếm', async () => {
      prisma.unit.findFirst.mockResolvedValue(null);
      await repository.existsByCode('org-1', 'CAI', 'unit-1');
      expect(prisma.unit.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', code: 'CAI', id: { not: 'unit-1' } },
        select: { id: true },
      });
    });
  });
});
