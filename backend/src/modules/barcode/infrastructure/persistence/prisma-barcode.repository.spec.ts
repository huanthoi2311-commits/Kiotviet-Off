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
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const rawBarcode = {
    id: 'barcode-1',
    productId: 'product-1',
    unitId: null,
    code: '8938505970381',
    type: 'EAN13',
    isDefault: false,
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
        update: jest.fn(),
        updateMany: jest.fn(),
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

  describe('update', () => {
    it('cập nhật thành công', async () => {
      prisma.barcode.update.mockResolvedValue({ ...rawBarcode, code: '999' });
      const result = await repository.update('barcode-1', {
        code: '999',
        updatedBy: 'user-1',
      });
      expect(result.code).toBe('999');
    });

    it('dịch lỗi P2002 khi trùng code', async () => {
      prisma.barcode.update.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(
        repository.update('barcode-1', { code: '999', updatedBy: 'user-1' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('softDelete', () => {
    it('set deletedAt và updatedBy', async () => {
      prisma.barcode.update.mockResolvedValue(rawBarcode);
      await repository.softDelete('barcode-1', 'user-1');
      expect(prisma.barcode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'barcode-1' },
          data: expect.objectContaining({ updatedBy: 'user-1' }),
        }),
      );
    });
  });

  describe('setDefault', () => {
    it('unset barcode default cũ rồi set barcode mới trong transaction', async () => {
      const updateMany = jest.fn();
      const update = jest
        .fn()
        .mockResolvedValue({ ...rawBarcode, isDefault: true });
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn({ barcode: { updateMany, update } })),
      );
      const result = await repository.setDefault(
        'barcode-1',
        'product-1',
        'user-1',
      );
      expect(result.isDefault).toBe(true);
      expect(updateMany).toHaveBeenCalledWith({
        where: { productId: 'product-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: 'barcode-1' },
        data: { isDefault: true, updatedBy: 'user-1' },
      });
    });
  });

  describe('existsByCode', () => {
    it('true khi tìm thấy', async () => {
      prisma.barcode.findFirst.mockResolvedValue({ id: 'barcode-1' });
      await expect(repository.existsByCode('8938505970381')).resolves.toBe(
        true,
      );
    });

    it('false khi không tìm thấy', async () => {
      prisma.barcode.findFirst.mockResolvedValue(null);
      await expect(repository.existsByCode('8938505970381')).resolves.toBe(
        false,
      );
    });

    it('loại trừ excludeId khỏi điều kiện tìm kiếm', async () => {
      prisma.barcode.findFirst.mockResolvedValue(null);
      await repository.existsByCode('8938505970381', 'barcode-1');
      expect(prisma.barcode.findFirst).toHaveBeenCalledWith({
        where: { code: '8938505970381', id: { not: 'barcode-1' } },
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
