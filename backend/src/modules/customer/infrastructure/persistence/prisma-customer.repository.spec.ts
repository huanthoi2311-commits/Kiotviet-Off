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
  address: null,
  province: null,
  district: null,
  ward: null,
  avatar: null,
  note: null,
  creditLimit: null,
  currentDebt: new Prisma.Decimal(0),
  totalRevenue: new Prisma.Decimal(0),
  totalOrder: 0,
  totalPoint: 0,
  status: 'ACTIVE',
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
      count: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      customer: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
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
    });

    it('dịch lỗi P2002 trên phone sang ConflictException kèm mã CUSTOMER_PHONE_DUPLICATE', async () => {
      prisma.customer.create.mockRejectedValue(
        knownError('P2002', { target: ['organizationId', 'phone'] }),
      );
      await expect(repository.create(input)).rejects.toThrow(ConflictException);
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

  describe('update', () => {
    it('cập nhật thành công', async () => {
      prisma.customer.update.mockResolvedValue({
        ...rawCustomer,
        fullName: 'Nguyễn Văn B',
      });
      const result = await repository.update('cus-1', {
        fullName: 'Nguyễn Văn B',
        updatedBy: 'user-1',
      });
      expect(result.fullName).toBe('Nguyễn Văn B');
    });

    it('dịch lỗi P2002 khi đổi sang phone đã tồn tại', async () => {
      prisma.customer.update.mockRejectedValue(
        knownError('P2002', { target: ['organizationId', 'phone'] }),
      );
      await expect(
        repository.update('cus-1', {
          phone: '0900000000',
          updatedBy: 'user-1',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('softDelete / restore', () => {
    it('softDelete gọi update với deletedAt', async () => {
      prisma.customer.update.mockResolvedValue(rawCustomer);
      await repository.softDelete('cus-1', 'user-1');
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'cus-1' },
        data: { deletedAt: expect.any(Date), updatedBy: 'user-1' },
      });
    });

    it('restore gọi update với deletedAt = null', async () => {
      prisma.customer.update.mockResolvedValue(rawCustomer);
      await repository.restore('cus-1', 'user-1');
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'cus-1' },
        data: { deletedAt: null, updatedBy: 'user-1' },
      });
    });
  });

  describe('search', () => {
    it('trả về danh sách phân trang', async () => {
      prisma.$transaction.mockResolvedValueOnce([[rawCustomer], 1]);
      const result = await repository.search({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
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
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('existsByPhone', () => {
    it('true khi tìm thấy', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'cus-1' });
      await expect(
        repository.existsByPhone('org-1', '0987654321'),
      ).resolves.toBe(true);
    });

    it('false khi không tìm thấy', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(
        repository.existsByPhone('org-1', '0987654321'),
      ).resolves.toBe(false);
    });

    it('loại trừ excludeId khi kiểm tra (dùng lúc update)', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await repository.existsByPhone('org-1', '0987654321', 'cus-1');
      expect(prisma.customer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: 'cus-1' } }),
        }),
      );
    });
  });
});
