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
  code: 'NCC000001',
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
  version: 1,
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
      findUniqueOrThrow: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
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
        findUniqueOrThrow: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
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
      code: 'NCC000001',
      companyName: 'Công ty Đức An',
      createdBy: 'user-1',
    };

    it('tạo thành công', async () => {
      prisma.supplier.create.mockResolvedValue(rawSupplier);
      const result = await repository.create(input);
      expect(result.code).toBe('NCC000001');
      expect(result.version).toBe(1);
    });

    it('luôn ghi status ACTIVE, bỏ qua input.status nếu có', async () => {
      prisma.supplier.create.mockResolvedValue(rawSupplier);
      await repository.create({ ...input, status: 'INACTIVE' });
      expect(prisma.supplier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
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

  describe('findById / findByCode / findByIdIncludingDeleted', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);
      await expect(repository.findById('missing', 'org-1')).resolves.toBeNull();
    });

    it('map đúng entity khi tìm thấy', async () => {
      prisma.supplier.findFirst.mockResolvedValue(rawSupplier);
      const result = await repository.findById('sup-1', 'org-1');
      expect(result?.companyName).toBe('Công ty Đức An');
    });

    it('findByCode scoped theo organizationId', async () => {
      prisma.supplier.findFirst.mockResolvedValue(rawSupplier);
      const result = await repository.findByCode('org-1', 'NCC000001');
      expect(result?.id).toBe('sup-1');
      expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', code: 'NCC000001', deletedAt: null },
      });
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

  describe('update (Optimistic Lock)', () => {
    it('cập nhật thành công khi version khớp', async () => {
      prisma.supplier.updateMany.mockResolvedValue({ count: 1 });
      prisma.supplier.findUniqueOrThrow.mockResolvedValue({
        ...rawSupplier,
        companyName: 'Đổi tên',
        version: 2,
      });
      const result = await repository.update('sup-1', 'org-1', 1, {
        companyName: 'Đổi tên',
        updatedBy: 'user-1',
      });
      expect(result.companyName).toBe('Đổi tên');
      expect(prisma.supplier.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sup-1', organizationId: 'org-1', version: 1 },
        }),
      );
    });

    it('ném lỗi concurrency khi version không khớp', async () => {
      prisma.supplier.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.update('sup-1', 'org-1', 1, {
          companyName: 'Đổi tên',
          updatedBy: 'user-1',
        }),
      ).rejects.toThrow('vừa bị thay đổi bởi giao dịch khác');
    });

    it('dịch lỗi P2002 khi trùng code', async () => {
      prisma.supplier.updateMany.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(
        repository.update('sup-1', 'org-1', 1, {
          companyName: 'B',
          updatedBy: 'user-1',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('changeStatusWithVersion', () => {
    it('đổi status thành công khi version khớp', async () => {
      prisma.supplier.updateMany.mockResolvedValue({ count: 1 });
      prisma.supplier.findUniqueOrThrow.mockResolvedValue({
        ...rawSupplier,
        status: 'ACTIVE',
        version: 2,
      });
      const result = await repository.changeStatusWithVersion(
        'sup-1',
        'org-1',
        1,
        'ACTIVE',
        'user-1',
      );
      expect(result.status).toBe('ACTIVE');
      expect(prisma.supplier.updateMany).toHaveBeenCalledWith({
        where: { id: 'sup-1', organizationId: 'org-1', version: 1 },
        data: {
          status: 'ACTIVE',
          updatedBy: 'user-1',
          version: { increment: 1 },
        },
      });
    });

    it('ném lỗi concurrency khi version không khớp', async () => {
      prisma.supplier.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.changeStatusWithVersion(
          'sup-1',
          'org-1',
          1,
          'ACTIVE',
          'user-1',
        ),
      ).rejects.toThrow('vừa bị thay đổi bởi giao dịch khác');
    });
  });

  describe('softDelete / restore (Optimistic Lock)', () => {
    it('softDelete set deletedAt + status=ARCHIVED, lọc theo organizationId+version', async () => {
      prisma.supplier.updateMany.mockResolvedValue({ count: 1 });
      await repository.softDelete('sup-1', 'org-1', 1, 'user-1');
      expect(prisma.supplier.updateMany).toHaveBeenCalledWith({
        where: { id: 'sup-1', organizationId: 'org-1', version: 1 },
        data: {
          deletedAt: expect.any(Date),
          status: 'ARCHIVED',
          updatedBy: 'user-1',
          version: { increment: 1 },
        },
      });
    });

    it('softDelete ném lỗi concurrency khi version không khớp', async () => {
      prisma.supplier.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.softDelete('sup-1', 'org-1', 1, 'user-1'),
      ).rejects.toThrow('vừa bị thay đổi bởi giao dịch khác');
    });

    it('restore set deletedAt=null + status=INACTIVE, lọc theo organizationId+version', async () => {
      prisma.supplier.updateMany.mockResolvedValue({ count: 1 });
      await repository.restore('sup-1', 'org-1', 2, 'user-1');
      expect(prisma.supplier.updateMany).toHaveBeenCalledWith({
        where: { id: 'sup-1', organizationId: 'org-1', version: 2 },
        data: {
          deletedAt: null,
          status: 'INACTIVE',
          updatedBy: 'user-1',
          version: { increment: 1 },
        },
      });
    });

    it('restore ném lỗi concurrency khi version không khớp', async () => {
      prisma.supplier.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.restore('sup-1', 'org-1', 2, 'user-1'),
      ).rejects.toThrow('vừa bị thay đổi bởi giao dịch khác');
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
      await repository.existsByCode('org-1', 'NCC000001', 'sup-1');
      expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          code: 'NCC000001',
          id: { not: 'sup-1' },
        },
        select: { id: true },
      });
    });
  });

  describe('hasPurchaseOrders (Archive Guard, không đổi — Decision SR02)', () => {
    it('true khi có đơn nhập hàng', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po-1' });
      await expect(repository.hasPurchaseOrders('sup-1')).resolves.toBe(true);
    });

    it('false khi không có', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(null);
      await expect(repository.hasPurchaseOrders('sup-1')).resolves.toBe(false);
    });
  });

  describe('importBatch (Decision SR04 — không đổi hành vi)', () => {
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
      const tx = makeTx({ NCC000002: null });
      const result = await repository.importBatch(
        'org-1',
        [{ rowNumber: 2, code: 'NCC000002', companyName: 'NCC Mới' }],
        'user-1',
      );
      expect(result).toEqual({ createdCount: 1, updatedCount: 0 });
      expect(tx.supplier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: 'NCC000002',
            createdBy: 'user-1',
          }),
        }),
      );
    });

    it('cập nhật khi code đã tồn tại', async () => {
      const tx = makeTx({ NCC000001: { id: 'sup-1' } });
      const result = await repository.importBatch(
        'org-1',
        [{ rowNumber: 2, code: 'NCC000001', companyName: 'NCC Cập nhật' }],
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
      makeTx({ NCC000001: { id: 'sup-1' }, NCC000002: null });
      const result = await repository.importBatch(
        'org-1',
        [
          { rowNumber: 2, code: 'NCC000001', companyName: 'A' },
          { rowNumber: 3, code: 'NCC000002', companyName: 'B' },
        ],
        'user-1',
      );
      expect(result).toEqual({ createdCount: 1, updatedCount: 1 });
    });

    it('vẫn đọc status từ row Excel (cột "Trạng thái" không bị đổi hành vi)', async () => {
      const tx = makeTx({ NCC000002: null });
      await repository.importBatch(
        'org-1',
        [
          {
            rowNumber: 2,
            code: 'NCC000002',
            companyName: 'NCC Mới',
            status: 'INACTIVE',
          },
        ],
        'user-1',
      );
      expect(tx.supplier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'INACTIVE' }),
        }),
      );
    });
  });
});
