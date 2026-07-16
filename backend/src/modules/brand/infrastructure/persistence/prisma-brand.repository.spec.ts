import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PrismaBrandRepository } from './prisma-brand.repository';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

describe('PrismaBrandRepository', () => {
  let repository: PrismaBrandRepository;
  let prisma: {
    brand: {
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

  const rawBrand = {
    id: 'brand-1',
    organizationId: 'org-1',
    code: 'NIKE',
    name: 'Nike',
    logo: null,
    description: null,
    website: null,
    country: null,
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
  };

  beforeEach(() => {
    prisma = {
      brand: {
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
    repository = new PrismaBrandRepository(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    const input = {
      organizationId: 'org-1',
      code: 'NIKE',
      name: 'Nike',
      createdBy: 'user-1',
    };

    it('tạo thành công', async () => {
      prisma.brand.create.mockResolvedValue(rawBrand);
      const result = await repository.create(input);
      expect(result.code).toBe('NIKE');
    });

    it('dịch lỗi P2002 sang ConflictException', async () => {
      prisma.brand.create.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(repository.create(input)).rejects.toThrow(ConflictException);
    });

    it('ném thẳng lỗi không xác định', async () => {
      prisma.brand.create.mockRejectedValue(new Error('boom'));
      await expect(repository.create(input)).rejects.toThrow('boom');
    });
  });

  describe('findById', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.brand.findFirst.mockResolvedValue(null);
      await expect(repository.findById('missing', 'org-1')).resolves.toBeNull();
    });

    it('map đúng entity khi tìm thấy', async () => {
      prisma.brand.findFirst.mockResolvedValue(rawBrand);
      const result = await repository.findById('brand-1', 'org-1');
      expect(result?.code).toBe('NIKE');
      expect(prisma.brand.findFirst).toHaveBeenCalledWith({
        where: { id: 'brand-1', organizationId: 'org-1', deletedAt: null },
      });
    });
  });

  describe('update', () => {
    it('cập nhật thành công khi version khớp', async () => {
      prisma.brand.updateMany.mockResolvedValue({ count: 1 });
      prisma.brand.findUniqueOrThrow.mockResolvedValue({
        ...rawBrand,
        name: 'Nike Inc.',
        version: 2,
      });
      const result = await repository.update('brand-1', 1, {
        name: 'Nike Inc.',
        updatedBy: 'user-1',
      });
      expect(result.name).toBe('Nike Inc.');
      expect(prisma.brand.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'brand-1', version: 1 },
        }),
      );
    });

    it('ném BrandConcurrencyConflictError khi version không khớp', async () => {
      prisma.brand.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.update('brand-1', 1, { name: 'x', updatedBy: 'user-1' }),
      ).rejects.toThrow('vừa bị thay đổi bởi giao dịch khác');
    });

    it('dịch lỗi P2002 khi trùng code', async () => {
      prisma.brand.updateMany.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(
        repository.update('brand-1', 1, { name: 'x', updatedBy: 'user-1' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('softDelete', () => {
    it('set deletedAt, updatedBy và tăng version', async () => {
      prisma.brand.update.mockResolvedValue(rawBrand);
      await repository.softDelete('brand-1', 'user-1');
      expect(prisma.brand.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'brand-1' },
          data: expect.objectContaining({
            updatedBy: 'user-1',
            version: { increment: 1 },
          }),
        }),
      );
    });
  });

  describe('findByIdIncludingDeleted', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.brand.findFirst.mockResolvedValue(null);
      await expect(
        repository.findByIdIncludingDeleted('missing', 'org-1'),
      ).resolves.toBeNull();
    });

    it('trả về entity kể cả đã bị xóa mềm (không lọc deletedAt)', async () => {
      prisma.brand.findFirst.mockResolvedValue({
        ...rawBrand,
        deletedAt: new Date('2026-01-02'),
      });
      const result = await repository.findByIdIncludingDeleted(
        'brand-1',
        'org-1',
      );
      expect(result?.deletedAt).not.toBeNull();
      expect(prisma.brand.findFirst).toHaveBeenCalledWith({
        where: { id: 'brand-1', organizationId: 'org-1' },
      });
    });
  });

  describe('restore', () => {
    it('set deletedAt=null, status=INACTIVE và tăng version', async () => {
      prisma.brand.update.mockResolvedValue(rawBrand);
      await repository.restore('brand-1', 'user-1');
      expect(prisma.brand.update).toHaveBeenCalledWith({
        where: { id: 'brand-1' },
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
      prisma.$transaction.mockResolvedValue([[rawBrand], 1]);
      const result = await repository.search(baseParams);
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('thêm điều kiện OR khi có search text', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await repository.search({ ...baseParams, search: 'nike' });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('isActive=true lọc theo status=ACTIVE (không có cột isActive)', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await repository.search({ ...baseParams, isActive: true });
      expect(prisma.brand.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [{ status: 'ACTIVE' }],
          }),
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
      expect(prisma.brand.findMany).toHaveBeenCalledWith(
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
      expect(prisma.brand.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { code: 'desc' } }),
      );
    });
  });

  describe('existsByCode', () => {
    it('true khi tìm thấy', async () => {
      prisma.brand.findFirst.mockResolvedValue({ id: 'brand-1' });
      await expect(repository.existsByCode('org-1', 'NIKE')).resolves.toBe(
        true,
      );
    });

    it('false khi không tìm thấy', async () => {
      prisma.brand.findFirst.mockResolvedValue(null);
      await expect(repository.existsByCode('org-1', 'NIKE')).resolves.toBe(
        false,
      );
    });

    it('loại trừ excludeId khỏi điều kiện tìm kiếm', async () => {
      prisma.brand.findFirst.mockResolvedValue(null);
      await repository.existsByCode('org-1', 'NIKE', 'brand-1');
      expect(prisma.brand.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          code: 'NIKE',
          id: { not: 'brand-1' },
        },
        select: { id: true },
      });
    });
  });
});
