import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PrismaCustomerRepository } from './prisma-customer.repository';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

const rawCustomer = {
  id: 'cus-1',
  organizationId: 'org-1',
  code: 'CUS000001',
  customerType: 'RETAIL',
  fullName: 'Nguyễn Văn A',
  phone: '0987654321',
  email: null,
  birthday: null,
  gender: null,
  taxCode: null,
  companyName: null,
  contactName: null,
  address: null,
  province: null,
  district: null,
  ward: null,
  avatar: null,
  note: null,
  creditLimit: null,
  paymentTermDays: null,
  currentDebt: new Prisma.Decimal(0),
  totalRevenue: new Prisma.Decimal(0),
  totalOrder: 0,
  totalPoint: 0,
  status: 'ACTIVE',
  version: 1,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

describe('PrismaCustomerRepository', () => {
  let repository: PrismaCustomerRepository;
  let prisma: {
    customer: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      customer: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    repository = new PrismaCustomerRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('create', () => {
    const input = {
      organizationId: 'org-1',
      code: 'CUS000001',
      fullName: 'Nguyễn Văn A',
      phone: '0987654321',
      createdBy: 'user-1',
    };

    it('tạo thành công', async () => {
      prisma.customer.create.mockResolvedValue(rawCustomer);
      const result = await repository.create(input);
      expect(result.code).toBe('CUS000001');
      expect(result.currentDebt).toBe('0');
      expect(result.version).toBe(1);
    });

    it('dịch lỗi P2002 trên code sang ConflictException', async () => {
      prisma.customer.create.mockRejectedValue(
        knownError('P2002', { target: ['organizationId', 'code'] }),
      );
      await expect(repository.create(input)).rejects.toThrow(ConflictException);
    });

    it('ném thẳng lỗi không xác định', async () => {
      prisma.customer.create.mockRejectedValue(new Error('boom'));
      await expect(repository.create(input)).rejects.toThrow('boom');
    });
  });

  describe('findById', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(repository.findById('missing', 'org-1')).resolves.toBeNull();
    });

    it('map đúng entity khi tìm thấy', async () => {
      prisma.customer.findFirst.mockResolvedValue(rawCustomer);
      const result = await repository.findById('cus-1', 'org-1');
      expect(result?.fullName).toBe('Nguyễn Văn A');
    });
  });

  describe('findByCode', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(
        repository.findByCode('org-1', 'CUS000001'),
      ).resolves.toBeNull();
    });

    it('map đúng entity khi tìm thấy, scoped theo organizationId', async () => {
      prisma.customer.findFirst.mockResolvedValue(rawCustomer);
      const result = await repository.findByCode('org-1', 'CUS000001');
      expect(result?.id).toBe('cus-1');
      expect(prisma.customer.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', code: 'CUS000001', deletedAt: null },
      });
    });
  });

  describe('findByIdIncludingDeleted', () => {
    it('trả về bản ghi kể cả đã xóa mềm', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        ...rawCustomer,
        deletedAt: new Date('2026-02-01'),
      });
      const result = await repository.findByIdIncludingDeleted(
        'cus-1',
        'org-1',
      );
      expect(result?.deletedAt).toEqual(new Date('2026-02-01'));
    });
  });

  describe('update (Optimistic Lock)', () => {
    it('cập nhật thành công khi version khớp', async () => {
      prisma.customer.updateMany.mockResolvedValue({ count: 1 });
      prisma.customer.findUniqueOrThrow.mockResolvedValue({
        ...rawCustomer,
        fullName: 'Nguyễn Văn B',
        version: 2,
      });
      const result = await repository.update('cus-1', 'org-1', 1, {
        fullName: 'Nguyễn Văn B',
        updatedBy: 'user-1',
      });
      expect(result.fullName).toBe('Nguyễn Văn B');
      expect(prisma.customer.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cus-1', organizationId: 'org-1', version: 1 },
        }),
      );
    });

    it('ném lỗi concurrency khi version không khớp', async () => {
      prisma.customer.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.update('cus-1', 'org-1', 1, {
          fullName: 'Nguyễn Văn B',
          updatedBy: 'user-1',
        }),
      ).rejects.toThrow('vừa bị thay đổi bởi giao dịch khác');
    });

    it('dịch lỗi P2002 khi đổi sang code đã tồn tại', async () => {
      prisma.customer.updateMany.mockRejectedValue(
        knownError('P2002', { target: ['organizationId', 'code'] }),
      );
      await expect(
        repository.update('cus-1', 'org-1', 1, {
          fullName: 'B',
          updatedBy: 'user-1',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('changeStatusWithVersion', () => {
    it('đổi status thành công khi version khớp', async () => {
      prisma.customer.updateMany.mockResolvedValue({ count: 1 });
      prisma.customer.findUniqueOrThrow.mockResolvedValue({
        ...rawCustomer,
        status: 'ACTIVE',
        version: 2,
      });
      const result = await repository.changeStatusWithVersion(
        'cus-1',
        'org-1',
        1,
        'ACTIVE',
        'user-1',
      );
      expect(result.status).toBe('ACTIVE');
      expect(prisma.customer.updateMany).toHaveBeenCalledWith({
        where: { id: 'cus-1', organizationId: 'org-1', version: 1 },
        data: {
          status: 'ACTIVE',
          updatedBy: 'user-1',
          version: { increment: 1 },
        },
      });
    });

    it('ném lỗi concurrency khi version không khớp', async () => {
      prisma.customer.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.changeStatusWithVersion(
          'cus-1',
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
      prisma.customer.updateMany.mockResolvedValue({ count: 1 });
      await repository.softDelete('cus-1', 'org-1', 1, 'user-1');
      expect(prisma.customer.updateMany).toHaveBeenCalledWith({
        where: { id: 'cus-1', organizationId: 'org-1', version: 1 },
        data: {
          deletedAt: expect.any(Date),
          status: 'ARCHIVED',
          updatedBy: 'user-1',
          version: { increment: 1 },
        },
      });
    });

    it('softDelete ném lỗi concurrency khi version không khớp', async () => {
      prisma.customer.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.softDelete('cus-1', 'org-1', 1, 'user-1'),
      ).rejects.toThrow('vừa bị thay đổi bởi giao dịch khác');
    });

    it('restore set deletedAt=null + status=INACTIVE, lọc theo organizationId+version', async () => {
      prisma.customer.updateMany.mockResolvedValue({ count: 1 });
      await repository.restore('cus-1', 'org-1', 2, 'user-1');
      expect(prisma.customer.updateMany).toHaveBeenCalledWith({
        where: { id: 'cus-1', organizationId: 'org-1', version: 2 },
        data: {
          deletedAt: null,
          status: 'INACTIVE',
          updatedBy: 'user-1',
          version: { increment: 1 },
        },
      });
    });

    it('restore ném lỗi concurrency khi version không khớp', async () => {
      prisma.customer.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.restore('cus-1', 'org-1', 2, 'user-1'),
      ).rejects.toThrow('vừa bị thay đổi bởi giao dịch khác');
    });
  });

  describe('search', () => {
    it('trả về danh sách phân trang', async () => {
      prisma.$transaction.mockResolvedValueOnce([[rawCustomer], 1]);
      const result = await repository.search({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
        sortBy: 'fullName',
        sortOrder: 'asc',
      });
      expect(result.total).toBe(1);
      expect(result.items[0].code).toBe('CUS000001');
    });

    it('áp dụng search theo nhiều trường (OR)', async () => {
      prisma.$transaction.mockResolvedValueOnce([[], 0]);
      await repository.search({
        organizationId: 'org-1',
        search: 'Nguyễn',
        page: 1,
        limit: 20,
        sortBy: 'fullName',
        sortOrder: 'asc',
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('existsByCode', () => {
    it('true khi tìm thấy', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'cus-1' });
      await expect(repository.existsByCode('org-1', 'CUS000001')).resolves.toBe(
        true,
      );
    });

    it('false khi không tìm thấy', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(repository.existsByCode('org-1', 'CUS000001')).resolves.toBe(
        false,
      );
    });

    it('loại trừ excludeId khi kiểm tra', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await repository.existsByCode('org-1', 'CUS000001', 'cus-1');
      expect(prisma.customer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: 'cus-1' } }),
        }),
      );
    });
  });

  describe('syncTotalPoint', () => {
    it('gọi update với đúng totalPoint, không đổi trường nào khác', async () => {
      prisma.customer.update.mockResolvedValue(rawCustomer);
      await repository.syncTotalPoint('cus-1', 250);
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'cus-1' },
        data: { totalPoint: 250 },
      });
    });
  });
});
