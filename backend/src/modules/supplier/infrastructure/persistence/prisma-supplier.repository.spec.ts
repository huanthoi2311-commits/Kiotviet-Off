import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PrismaSupplierRepository } from './prisma-supplier.repository';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

const rawSupplier = {
  id: 'sup-1',
  organizationId: 'org-1',
  code: 'NCC001',
  taxCode: null,
  companyName: 'Công ty Đức An',
  contactName: null,
  phone: null,
  email: null,
  website: null,
  address: null,
  province: null,
  district: null,
  ward: null,
  bankName: null,
  bankAccount: null,
  paymentTerm: null,
  creditLimit: null,
  status: 'ACTIVE',
  note: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

describe('PrismaSupplierRepository', () => {
  let repository: PrismaSupplierRepository;
  let prisma: {
    supplier: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    purchaseOrder: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      supplier: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      purchaseOrder: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    repository = new PrismaSupplierRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('create', () => {
    const input = {
      organizationId: 'org-1',
      code: 'NCC001',
      companyName: 'Công ty Đức An',
      createdBy: 'user-1',
    };

    it('tạo thành công', async () => {
      prisma.supplier.create.mockResolvedValue(rawSupplier);
      const result = await repository.create(input);
      expect(result.code).toBe('NCC001');
    });

    it('dịch lỗi P2002 sang ConflictException', async () => {
      prisma.supplier.create.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(repository.create(input)).rejects.toThrow(ConflictException);
    });

    it('ném thẳng lỗi không xác định', async () => {
      prisma.supplier.create.mockRejectedValue(new Error('boom'));
      await expect(repository.create(input)).rejects.toThrow('boom');
    });
  });

  describe('findById / findByIdIncludingDeleted', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);
      await expect(repository.findById('missing', 'org-1')).resolves.toBeNull();
    });

    it('map đúng entity khi tìm thấy', async () => {
      prisma.supplier.findFirst.mockResolvedValue(rawSupplier);
      const result = await repository.findById('sup-1', 'org-1');
      expect(result?.companyName).toBe('Công ty Đức An');
    });

    it('findByIdIncludingDeleted không lọc deletedAt', async () => {
      prisma.supplier.findFirst.mockResolvedValue({
        ...rawSupplier,
        deletedAt: new Date(),
      });
      const result = await repository.findByIdIncludingDeleted(
        'sup-1',
        'org-1',
      );
      expect(result?.deletedAt).not.toBeNull();
      expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
        where: { id: 'sup-1', organizationId: 'org-1' },
      });
    });
  });

  describe('update', () => {
    it('cập nhật thành công', async () => {
      prisma.supplier.update.mockResolvedValue({
        ...rawSupplier,
        companyName: 'Đổi tên',
      });
      const result = await repository.update('sup-1', {
        companyName: 'Đổi tên',
        updatedBy: 'user-1',
      });
      expect(result.companyName).toBe('Đổi tên');
    });

    it('dịch lỗi P2002 khi trùng code', async () => {
      prisma.supplier.update.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(
        repository.update('sup-1', { code: 'DUP', updatedBy: 'user-1' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('softDelete / restore', () => {
    it('softDelete set deletedAt và updatedBy', async () => {
      prisma.supplier.update.mockResolvedValue(rawSupplier);
      await repository.softDelete('sup-1', 'user-1');
      expect(prisma.supplier.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sup-1' },
          data: expect.objectContaining({ updatedBy: 'user-1' }),
        }),
      );
    });

    it('restore clear deletedAt', async () => {
      prisma.supplier.update.mockResolvedValue(rawSupplier);
      await repository.restore('sup-1', 'user-1');
      expect(prisma.supplier.update).toHaveBeenCalledWith({
        where: { id: 'sup-1' },
        data: { deletedAt: null, updatedBy: 'user-1' },
      });
    });
  });

  describe('search / findAllForExport', () => {
    it('search trả về danh sách phân trang', async () => {
      prisma.$transaction.mockResolvedValueOnce([[rawSupplier], 1]);
      const result = await repository.search({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      expect(result.total).toBe(1);
    });

    it('findAllForExport không phân trang', async () => {
      prisma.supplier.findMany.mockResolvedValue([rawSupplier, rawSupplier]);
      const result = await repository.findAllForExport({
        organizationId: 'org-1',
        sortBy: 'code',
        sortOrder: 'asc',
      });
      expect(result).toHaveLength(2);
      expect(prisma.supplier.count).not.toHaveBeenCalled();
    });
  });

  describe('existsByCode', () => {
    it('true khi tìm thấy, loại trừ excludeId', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);
      await repository.existsByCode('org-1', 'NCC001', 'sup-1');
      expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          code: 'NCC001',
          id: { not: 'sup-1' },
        },
        select: { id: true },
      });
    });
  });

  describe('hasPurchaseOrders', () => {
    it('true khi có đơn nhập hàng', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po-1' });
      await expect(repository.hasPurchaseOrders('sup-1')).resolves.toBe(true);
    });

    it('false khi không có', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(null);
      await expect(repository.hasPurchaseOrders('sup-1')).resolves.toBe(false);
    });
  });

  describe('importBatch', () => {
    function makeTx(existingByCode: Record<string, { id: string } | null>) {
      const update = jest.fn().mockResolvedValue(rawSupplier);
      const create = jest.fn().mockResolvedValue(rawSupplier);
      const findFirst = jest.fn(({ where }: { where: { code: string } }) =>
        Promise.resolve(existingByCode[where.code] ?? null),
      );
      const tx = { supplier: { findFirst, update, create } };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(tx)),
      );
      return tx;
    }

    it('tạo mới khi code chưa tồn tại', async () => {
      const tx = makeTx({ NCC002: null });
      const result = await repository.importBatch(
        'org-1',
        [{ rowNumber: 2, code: 'NCC002', companyName: 'NCC Mới' }],
        'user-1',
      );
      expect(result).toEqual({ createdCount: 1, updatedCount: 0 });
      expect(tx.supplier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: 'NCC002',
            createdBy: 'user-1',
          }),
        }),
      );
    });

    it('cập nhật khi code đã tồn tại', async () => {
      const tx = makeTx({ NCC001: { id: 'sup-1' } });
      const result = await repository.importBatch(
        'org-1',
        [{ rowNumber: 2, code: 'NCC001', companyName: 'NCC Cập nhật' }],
        'user-1',
      );
      expect(result).toEqual({ createdCount: 0, updatedCount: 1 });
      expect(tx.supplier.update).toHaveBeenCalledWith({
        where: { id: 'sup-1' },
        data: expect.objectContaining({
          companyName: 'NCC Cập nhật',
          updatedBy: 'user-1',
        }),
      });
    });

    it('xử lý nhiều dòng trong cùng transaction', async () => {
      makeTx({ NCC001: { id: 'sup-1' }, NCC002: null });
      const result = await repository.importBatch(
        'org-1',
        [
          { rowNumber: 2, code: 'NCC001', companyName: 'A' },
          { rowNumber: 3, code: 'NCC002', companyName: 'B' },
        ],
        'user-1',
      );
      expect(result).toEqual({ createdCount: 1, updatedCount: 1 });
    });
  });
});
