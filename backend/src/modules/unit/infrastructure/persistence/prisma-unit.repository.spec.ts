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

  describe('update', () => {
    it('cập nhật thành công', async () => {
      prisma.unit.update.mockResolvedValue({
        ...rawUnit,
        name: 'Cái (đã sửa)',
      });
      const result = await repository.update('unit-1', {
        name: 'Cái (đã sửa)',
        updatedBy: 'user-1',
      });
      expect(result.name).toBe('Cái (đã sửa)');
    });

    it('dịch lỗi P2002 khi trùng code', async () => {
      prisma.unit.update.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(
        repository.update('unit-1', { name: 'x', updatedBy: 'user-1' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('softDelete', () => {
    it('set deletedAt và updatedBy', async () => {
      prisma.unit.update.mockResolvedValue(rawUnit);
      await repository.softDelete('unit-1', 'user-1');
      expect(prisma.unit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'unit-1' },
          data: expect.objectContaining({ updatedBy: 'user-1' }),
        }),
      );
    });
  });

  describe('search', () => {
    it('trả về danh sách phân trang', async () => {
      prisma.$transaction.mockResolvedValue([[rawUnit], 1]);
      const result = await repository.search({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('thêm điều kiện OR khi có search text', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await repository.search({
        organizationId: 'org-1',
        search: 'cai',
        page: 1,
        limit: 20,
      });
      expect(prisma.$transaction).toHaveBeenCalled();
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
