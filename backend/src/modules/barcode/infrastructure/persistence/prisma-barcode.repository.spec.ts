import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PrismaBarcodeRepository } from './prisma-barcode.repository';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

describe('PrismaBarcodeRepository', () => {
  let repository: PrismaBarcodeRepository;
  let prisma: {
    barcode: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const rawBarcode = {
    id: 'barcode-1',
    organizationId: 'org-1',
    productId: 'product-1',
    unitId: null,
    code: '8938505970381',
    type: 'EAN13',
    isDefault: false,
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
  };

  beforeEach(() => {
    prisma = {
      barcode: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    repository = new PrismaBarcodeRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('create', () => {
    const input = {
      productId: 'product-1',
      organizationId: 'org-1',
      code: '8938505970381',
      type: 'EAN13' as const,
      createdBy: 'user-1',
    };

    it('tạo thành công (không phải default)', async () => {
      prisma.barcode.create.mockResolvedValue(rawBarcode);
      const result = await repository.create(input);
      expect(result.code).toBe('8938505970381');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('tạo thành công dùng transaction khi isDefault=true', async () => {
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(
          fn({
            barcode: {
              updateMany: jest.fn(),
              create: jest
                .fn()
                .mockResolvedValue({ ...rawBarcode, isDefault: true }),
            },
          }),
        ),
      );
      const result = await repository.create({ ...input, isDefault: true });
      expect(result.isDefault).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('dịch lỗi P2002 sang ConflictException', async () => {
      prisma.barcode.create.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(repository.create(input)).rejects.toThrow(ConflictException);
    });

    it('dịch lỗi P2003 sang BadRequestException', async () => {
      prisma.barcode.create.mockRejectedValue(
        knownError('P2003', { field_name: 'unitId' }),
      );
      await expect(repository.create(input)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('ném thẳng lỗi không xác định', async () => {
      prisma.barcode.create.mockRejectedValue(new Error('boom'));
      await expect(repository.create(input)).rejects.toThrow('boom');
    });
  });

  describe('findById', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.barcode.findFirst.mockResolvedValue(null);
      await expect(repository.findById('missing', 'org-1')).resolves.toBeNull();
    });

    it('map đúng entity khi tìm thấy, lọc theo organizationId qua product', async () => {
      prisma.barcode.findFirst.mockResolvedValue(rawBarcode);
      const result = await repository.findById('barcode-1', 'org-1');
      expect(result?.code).toBe('8938505970381');
      expect(prisma.barcode.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'barcode-1',
          deletedAt: null,
          product: { organizationId: 'org-1', deletedAt: null },
        },
      });
    });
  });

  describe('findByIdIncludingDeleted', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.barcode.findFirst.mockResolvedValue(null);
      await expect(
        repository.findByIdIncludingDeleted('missing', 'org-1'),
      ).resolves.toBeNull();
    });

    it('trả về entity kể cả đã bị xóa mềm (không lọc deletedAt)', async () => {
      prisma.barcode.findFirst.mockResolvedValue({
        ...rawBarcode,
        deletedAt: new Date('2026-01-02'),
      });
      const result = await repository.findByIdIncludingDeleted(
        'barcode-1',
        'org-1',
      );
      expect(result?.deletedAt).not.toBeNull();
      expect(prisma.barcode.findFirst).toHaveBeenCalledWith({
        where: { id: 'barcode-1', product: { organizationId: 'org-1' } },
      });
    });
  });

  describe('listByProduct', () => {
    it('trả về danh sách sắp default lên đầu', async () => {
      prisma.barcode.findMany.mockResolvedValue([rawBarcode]);
      const result = await repository.listByProduct('product-1', 'org-1');
      expect(result).toHaveLength(1);
      expect(prisma.barcode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            productId: 'product-1',
            deletedAt: null,
            product: { organizationId: 'org-1', deletedAt: null },
          },
        }),
      );
    });
  });

  describe('search', () => {
    const baseParams = {
      organizationId: 'org-1',
      page: 1,
      limit: 20,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
    };

    it('trả về danh sách phân trang', async () => {
      prisma.$transaction.mockResolvedValue([[rawBarcode], 1]);
      const result = await repository.search(baseParams);
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('thêm điều kiện contains theo code khi có search text', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await repository.search({ ...baseParams, search: '893850' });
      expect(prisma.barcode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            code: { contains: '893850', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('isActive=true lọc theo status=ACTIVE (không có cột isActive)', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await repository.search({ ...baseParams, isActive: true });
      expect(prisma.barcode.findMany).toHaveBeenCalledWith(
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
      expect(prisma.barcode.findMany).toHaveBeenCalledWith(
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
        sortOrder: 'asc',
      });
      expect(prisma.barcode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { code: 'asc' } }),
      );
    });
  });

  describe('update', () => {
    it('cập nhật thành công khi id/organizationId/version khớp', async () => {
      prisma.barcode.updateMany.mockResolvedValue({ count: 1 });
      prisma.barcode.findUniqueOrThrow.mockResolvedValue({
        ...rawBarcode,
        code: '999',
        version: 2,
      });
      const result = await repository.update('barcode-1', 'org-1', 1, {
        code: '999',
        updatedBy: 'user-1',
      });
      expect(result.code).toBe('999');
      expect(prisma.barcode.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'barcode-1', organizationId: 'org-1', version: 1 },
        }),
      );
    });

    it('ném BarcodeConcurrencyConflictError khi version không khớp', async () => {
      prisma.barcode.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.update('barcode-1', 'org-1', 1, {
          code: '999',
          updatedBy: 'user-1',
        }),
      ).rejects.toThrow('vừa bị thay đổi bởi giao dịch khác');
    });

    it('dịch lỗi P2002 khi trùng code', async () => {
      prisma.barcode.updateMany.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(
        repository.update('barcode-1', 'org-1', 1, {
          code: '999',
          updatedBy: 'user-1',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('softDelete', () => {
    it('set deletedAt, status=ARCHIVED, updatedBy và tăng version, lọc theo organizationId+version', async () => {
      prisma.barcode.updateMany.mockResolvedValue({ count: 1 });
      await repository.softDelete('barcode-1', 'org-1', 1, 'user-1');
      expect(prisma.barcode.updateMany).toHaveBeenCalledWith({
        where: { id: 'barcode-1', organizationId: 'org-1', version: 1 },
        data: {
          deletedAt: expect.any(Date),
          status: 'ARCHIVED',
          updatedBy: 'user-1',
          version: { increment: 1 },
        },
      });
    });

    it('ném BarcodeConcurrencyConflictError khi version không khớp', async () => {
      prisma.barcode.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.softDelete('barcode-1', 'org-1', 1, 'user-1'),
      ).rejects.toThrow('vừa bị thay đổi bởi giao dịch khác');
    });
  });

  describe('restore', () => {
    it('set deletedAt=null, status=INACTIVE, tăng version, lọc theo organizationId+version', async () => {
      prisma.barcode.updateMany.mockResolvedValue({ count: 1 });
      await repository.restore('barcode-1', 'org-1', 2, 'user-1');
      expect(prisma.barcode.updateMany).toHaveBeenCalledWith({
        where: { id: 'barcode-1', organizationId: 'org-1', version: 2 },
        data: {
          deletedAt: null,
          status: 'INACTIVE',
          updatedBy: 'user-1',
          version: { increment: 1 },
        },
      });
    });

    it('ném BarcodeConcurrencyConflictError khi version không khớp', async () => {
      prisma.barcode.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.restore('barcode-1', 'org-1', 2, 'user-1'),
      ).rejects.toThrow('vừa bị thay đổi bởi giao dịch khác');
    });
  });

  describe('setDefault', () => {
    it('unset barcode default cũ (không kiểm version) rồi set barcode đích (kiểm version) trong transaction', async () => {
      const updateMany = jest
        .fn()
        .mockResolvedValueOnce({ count: 2 }) // unset others
        .mockResolvedValueOnce({ count: 1 }); // set target
      const findUniqueOrThrow = jest
        .fn()
        .mockResolvedValue({ ...rawBarcode, isDefault: true });
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn({ barcode: { updateMany, findUniqueOrThrow } })),
      );
      const result = await repository.setDefault(
        'barcode-1',
        'org-1',
        'product-1',
        1,
        'user-1',
      );
      expect(result.isDefault).toBe(true);
      expect(updateMany).toHaveBeenNthCalledWith(1, {
        where: {
          productId: 'product-1',
          organizationId: 'org-1',
          isDefault: true,
          id: { not: 'barcode-1' },
        },
        data: { isDefault: false, version: { increment: 1 } },
      });
      expect(updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'barcode-1', organizationId: 'org-1', version: 1 },
        data: {
          isDefault: true,
          updatedBy: 'user-1',
          version: { increment: 1 },
        },
      });
    });

    it('ném BarcodeConcurrencyConflictError khi version của dòng đích không khớp', async () => {
      const updateMany = jest
        .fn()
        .mockResolvedValueOnce({ count: 0 }) // unset others (không liên quan)
        .mockResolvedValueOnce({ count: 0 }); // set target thất bại
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn({ barcode: { updateMany } })),
      );
      await expect(
        repository.setDefault('barcode-1', 'org-1', 'product-1', 1, 'user-1'),
      ).rejects.toThrow('vừa bị thay đổi bởi giao dịch khác');
    });
  });

  describe('existsByCode', () => {
    it('true khi tìm thấy', async () => {
      prisma.barcode.findFirst.mockResolvedValue({ id: 'barcode-1' });
      await expect(
        repository.existsByCode('org-1', '8938505970381'),
      ).resolves.toBe(true);
    });

    it('false khi không tìm thấy', async () => {
      prisma.barcode.findFirst.mockResolvedValue(null);
      await expect(
        repository.existsByCode('org-1', '8938505970381'),
      ).resolves.toBe(false);
    });

    it('loại trừ excludeId khỏi điều kiện tìm kiếm, lọc theo organizationId', async () => {
      prisma.barcode.findFirst.mockResolvedValue(null);
      await repository.existsByCode('org-1', '8938505970381', 'barcode-1');
      expect(prisma.barcode.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          code: '8938505970381',
          id: { not: 'barcode-1' },
        },
        select: { id: true },
      });
    });
  });

  describe('hasActiveBarcodesInUnit', () => {
    it('true khi còn Barcode chưa xóa mềm tham chiếu Unit', async () => {
      prisma.barcode.findFirst.mockResolvedValue({ id: 'barcode-1' });
      await expect(repository.hasActiveBarcodesInUnit('unit-1')).resolves.toBe(
        true,
      );
      expect(prisma.barcode.findFirst).toHaveBeenCalledWith({
        where: { unitId: 'unit-1', deletedAt: null },
        select: { id: true },
      });
    });

    it('false khi không còn Barcode nào tham chiếu Unit', async () => {
      prisma.barcode.findFirst.mockResolvedValue(null);
      await expect(repository.hasActiveBarcodesInUnit('unit-1')).resolves.toBe(
        false,
      );
    });
  });
});
