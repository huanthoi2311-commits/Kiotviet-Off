import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UsageLimitService } from '../../../usage-limit/application/usage-limit.service';
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
  let usageLimit: jest.Mocked<Pick<UsageLimitService, 'lock' | 'getLimit'>>;

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
    usageLimit = {
      lock: jest.fn().mockResolvedValue(undefined),
      getLimit: jest.fn().mockResolvedValue(null),
    };
    repository = new PrismaCustomerRepository(
      prisma as unknown as PrismaService,
      usageLimit as unknown as UsageLimitService,
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

    function makeCreateTx(overrides: { count?: number } = {}) {
      const client = {
        customer: {
          count: jest.fn().mockResolvedValue(overrides.count ?? 0),
          create: jest.fn().mockResolvedValue(rawCustomer),
        },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(client),
      );
      return client;
    }

    it('tạo thành công (limit null)', async () => {
      makeCreateTx();
      const result = await repository.create(input);
      expect(result.code).toBe('CUS000001');
      expect(result.currentDebt).toBe('0');
      expect(result.version).toBe(1);
    });

    it('dịch lỗi P2002 trên code sang ConflictException', async () => {
      const tx = makeCreateTx();
      tx.customer.create.mockRejectedValue(
        knownError('P2002', { target: ['organizationId', 'code'] }),
      );
      await expect(repository.create(input)).rejects.toThrow(ConflictException);
    });

    it('ném thẳng lỗi không xác định', async () => {
      const tx = makeCreateTx();
      tx.customer.create.mockRejectedValue(new Error('boom'));
      await expect(repository.create(input)).rejects.toThrow('boom');
    });

    it('T053.05B — thứ tự bắt buộc LOCK → đọc limit → COUNT(deletedAt IS NULL) → INSERT', async () => {
      const tx = makeCreateTx({ count: 49 });
      const callOrder: string[] = [];
      usageLimit.lock.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('lock');
      });
      usageLimit.getLimit.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('getLimit');
        return 50;
      });
      tx.customer.count.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('count');
        return 49;
      });
      tx.customer.create.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('create');
        return rawCustomer;
      });

      await repository.create(input);

      expect(callOrder).toEqual(['lock', 'getLimit', 'count', 'create']);
      expect(usageLimit.lock).toHaveBeenCalledWith(tx, 'org-1', 'CUSTOMER');
      expect(tx.customer.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
      });
    });

    it('T053.05B — currentUsage >= limit → 409, tx.customer.create KHÔNG được gọi', async () => {
      const tx = makeCreateTx({ count: 50 });
      usageLimit.getLimit.mockResolvedValue(50);
      await expect(repository.create(input)).rejects.toThrow(ConflictException);
      expect(tx.customer.create).not.toHaveBeenCalled();
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
  });

  describe('restore (T053.05B — quota-increasing, cùng khoá CUSTOMER với create, giữ nguyên CAS)', () => {
    function makeRestoreTx(
      overrides: { count?: number; updateManyCount?: number } = {},
    ) {
      const client = {
        customer: {
          count: jest.fn().mockResolvedValue(overrides.count ?? 0),
          updateMany: jest
            .fn()
            .mockResolvedValue({ count: overrides.updateManyCount ?? 1 }),
        },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(client),
      );
      return client;
    }

    it('restore set deletedAt=null + status=INACTIVE, lọc theo organizationId+version (limit null)', async () => {
      const tx = makeRestoreTx({ updateManyCount: 1 });
      await repository.restore('cus-1', 'org-1', 2, 'user-1');
      expect(tx.customer.updateMany).toHaveBeenCalledWith({
        where: { id: 'cus-1', organizationId: 'org-1', version: 2 },
        data: {
          deletedAt: null,
          status: 'INACTIVE',
          updatedBy: 'user-1',
          version: { increment: 1 },
        },
      });
    });

    it('restore ném lỗi concurrency khi version không khớp (CAS giữ nguyên)', async () => {
      makeRestoreTx({ updateManyCount: 0 });
      await expect(
        repository.restore('cus-1', 'org-1', 2, 'user-1'),
      ).rejects.toThrow('vừa bị thay đổi bởi giao dịch khác');
    });

    it('T053.05B — dùng CÙNG khoá logic (organizationId, CUSTOMER) như create()', async () => {
      makeRestoreTx();
      await repository.restore('cus-1', 'org-1', 2, 'user-1');
      expect(usageLimit.lock).toHaveBeenCalledWith(
        expect.anything(),
        'org-1',
        'CUSTOMER',
      );
    });

    it('T053.05B — thứ tự bắt buộc LOCK → đọc limit → COUNT → updateMany (CAS)', async () => {
      const tx = makeRestoreTx({ count: 49, updateManyCount: 1 });
      const callOrder: string[] = [];
      usageLimit.lock.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('lock');
      });
      usageLimit.getLimit.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('getLimit');
        return 50;
      });
      tx.customer.count.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('count');
        return 49;
      });
      tx.customer.updateMany.mockImplementation(async () => {
        await Promise.resolve();
        callOrder.push('updateMany');
        return { count: 1 };
      });

      await repository.restore('cus-1', 'org-1', 2, 'user-1');

      expect(callOrder).toEqual(['lock', 'getLimit', 'count', 'updateMany']);
      expect(tx.customer.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
      });
    });

    it('T053.05B — currentUsage >= limit → 409, tx.customer.updateMany (restore) KHÔNG được gọi', async () => {
      const tx = makeRestoreTx({ count: 50 });
      usageLimit.getLimit.mockResolvedValue(50);
      await expect(
        repository.restore('cus-1', 'org-1', 2, 'user-1'),
      ).rejects.toThrow(ConflictException);
      expect(tx.customer.updateMany).not.toHaveBeenCalled();
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

    describe('deletedAt theo status (T048.05 — sửa lỗi ARCHIVED không bao giờ trả kết quả)', () => {
      const baseParams = {
        organizationId: 'org-1',
        page: 1,
        limit: 20,
        sortBy: 'fullName' as const,
        sortOrder: 'asc' as const,
      };

      it('không truyền status → deletedAt: null (mặc định như trước, chỉ trả khách hàng chưa xóa)', async () => {
        prisma.$transaction.mockResolvedValueOnce([[], 0]);
        await repository.search({ ...baseParams });
        expect(prisma.customer.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ deletedAt: null }),
          }),
        );
      });

      it('status=ACTIVE → deletedAt: null', async () => {
        prisma.$transaction.mockResolvedValueOnce([[], 0]);
        await repository.search({ ...baseParams, status: 'ACTIVE' });
        expect(prisma.customer.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              deletedAt: null,
              status: 'ACTIVE',
            }),
          }),
        );
      });

      it('status=INACTIVE → deletedAt: null', async () => {
        prisma.$transaction.mockResolvedValueOnce([[], 0]);
        await repository.search({ ...baseParams, status: 'INACTIVE' });
        expect(prisma.customer.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              deletedAt: null,
              status: 'INACTIVE',
            }),
          }),
        );
      });

      it('status=ARCHIVED → deletedAt: { not: null } (trước T048.05 luôn là null, không bao giờ khớp)', async () => {
        const archivedRow = {
          ...rawCustomer,
          id: 'cus-archived',
          status: 'ARCHIVED',
          deletedAt: new Date('2026-02-01'),
        };
        prisma.$transaction.mockResolvedValueOnce([[archivedRow], 1]);

        const result = await repository.search({
          ...baseParams,
          status: 'ARCHIVED',
        });

        expect(prisma.customer.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              deletedAt: { not: null },
              status: 'ARCHIVED',
            }),
          }),
        );
        expect(result.items).toHaveLength(1);
        expect(result.items[0].status).toBe('ARCHIVED');
        expect(result.items[0].deletedAt).toEqual(new Date('2026-02-01'));
      });

      it('organizationId scoping không đổi khi status=ARCHIVED', async () => {
        prisma.$transaction.mockResolvedValueOnce([[], 0]);
        await repository.search({ ...baseParams, status: 'ARCHIVED' });
        expect(prisma.customer.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ organizationId: 'org-1' }),
          }),
        );
      });

      it('customerType filter không đổi khi status=ARCHIVED', async () => {
        prisma.$transaction.mockResolvedValueOnce([[], 0]);
        await repository.search({
          ...baseParams,
          status: 'ARCHIVED',
          customerType: 'VIP',
        });
        expect(prisma.customer.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ customerType: 'VIP' }),
          }),
        );
      });

      it('phân trang không đổi khi status=ARCHIVED (skip/take vẫn được áp dụng đúng)', async () => {
        prisma.$transaction.mockResolvedValueOnce([[], 0]);
        await repository.search({
          ...baseParams,
          status: 'ARCHIVED',
          page: 3,
          limit: 10,
        });
        expect(prisma.customer.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ skip: 20, take: 10 }),
        );
        expect(prisma.customer.count).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ deletedAt: { not: null } }),
          }),
        );
      });

      it('sắp xếp không đổi khi status=ARCHIVED (orderBy vẫn theo sortBy/sortOrder truyền vào)', async () => {
        prisma.$transaction.mockResolvedValueOnce([[], 0]);
        await repository.search({
          ...baseParams,
          status: 'ARCHIVED',
          sortBy: 'createdAt',
          sortOrder: 'desc',
        });
        expect(prisma.customer.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
        );
      });
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
