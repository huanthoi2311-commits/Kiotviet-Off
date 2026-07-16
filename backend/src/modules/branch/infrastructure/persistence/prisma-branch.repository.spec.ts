import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  BranchHasActiveWarehouseError,
  BranchInvoicePrefixConflictError,
  BranchNotActiveError,
  BranchOrganizationMinOneActiveError,
} from '../../domain/repositories/branch.repository.interface';
import { PrismaBranchRepository } from './prisma-branch.repository';

describe('PrismaBranchRepository', () => {
  let repository: PrismaBranchRepository;
  let prisma: {
    branch: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const rawBranch = {
    id: 'branch-1',
    organizationId: 'org-1',
    managerUserId: null,
    defaultWarehouseId: null,
    code: 'BR000001',
    name: 'Chi nhánh HN',
    email: null,
    address: null,
    province: null,
    district: null,
    ward: null,
    phone: null,
    invoicePrefix: 'HN',
    receiptPrefix: null,
    timezone: 'Asia/Ho_Chi_Minh',
    currencyCode: 'VND',
    isMain: false,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    prisma = {
      branch: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    repository = new PrismaBranchRepository(prisma as unknown as PrismaService);
  });

  const createInput = {
    organizationId: 'org-1',
    code: 'BR000001',
    name: 'Chi nhánh HN',
    invoicePrefix: 'HN',
    createdBy: 'user-1',
  };

  describe('create', () => {
    it('tạo branch thành công', async () => {
      prisma.branch.create.mockResolvedValue(rawBranch);
      const result = await repository.create(createInput);
      expect(result.code).toBe('BR000001');
      expect(prisma.branch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            timezone: 'Asia/Ho_Chi_Minh',
            currencyCode: 'VND',
          }),
        }),
      );
    });

    it('ném BranchInvoicePrefixConflictError khi invoicePrefix trùng (P2002)', async () => {
      prisma.branch.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['organizationId', 'invoicePrefix'] },
        }),
      );
      await expect(repository.create(createInput)).rejects.toThrow(
        BranchInvoicePrefixConflictError,
      );
    });
  });

  describe('findById', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);
      await expect(
        repository.findById('branch-x', 'org-1'),
      ).resolves.toBeNull();
    });

    it('trả về entity khi tìm thấy', async () => {
      prisma.branch.findFirst.mockResolvedValue(rawBranch);
      const result = await repository.findById('branch-1', 'org-1');
      expect(result?.code).toBe('BR000001');
    });
  });

  describe('search', () => {
    it('trả về danh sách phân trang', async () => {
      prisma.$transaction.mockResolvedValueOnce([[rawBranch], 1]);
      const result = await repository.search({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(1);
    });
  });

  describe('update', () => {
    it('cập nhật thành công (where chỉ theo id, org đã xác nhận ở Service)', async () => {
      prisma.branch.update.mockResolvedValue({ ...rawBranch, name: 'HN 2' });
      const result = await repository.update('branch-1', 'org-1', {
        name: 'HN 2',
        updatedBy: 'user-1',
      });
      expect(result.name).toBe('HN 2');
      expect(prisma.branch.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'branch-1' } }),
      );
    });

    it('ném BranchInvoicePrefixConflictError khi invoicePrefix trùng (P2002)', async () => {
      prisma.branch.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['organizationId', 'invoicePrefix'] },
        }),
      );
      await expect(
        repository.update('branch-1', 'org-1', {
          invoicePrefix: 'HCM',
          updatedBy: 'user-1',
        }),
      ).rejects.toThrow(BranchInvoicePrefixConflictError);
    });
  });

  describe('archive', () => {
    function makeClient(overrides: {
      current?: unknown;
      activeWarehouseCount?: number;
      otherActiveBranches?: number;
    }) {
      const client = {
        branch: {
          findFirst: jest
            .fn()
            .mockResolvedValue(
              overrides.current === undefined ? rawBranch : overrides.current,
            ),
          count: jest
            .fn()
            .mockResolvedValue(overrides.otherActiveBranches ?? 1),
          update: jest
            .fn()
            .mockResolvedValue({ ...rawBranch, status: 'ARCHIVED' }),
        },
        warehouse: {
          count: jest
            .fn()
            .mockResolvedValue(overrides.activeWarehouseCount ?? 0),
        },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(client),
      );
      return client;
    }

    it('ném BranchNotActiveError khi branch không tồn tại', async () => {
      makeClient({ current: null });
      await expect(
        repository.archive('branch-x', 'org-1', 'user-1'),
      ).rejects.toThrow(BranchNotActiveError);
    });

    it('ném BranchNotActiveError khi đã ARCHIVED từ trước', async () => {
      makeClient({ current: { ...rawBranch, status: 'ARCHIVED' } });
      await expect(
        repository.archive('branch-1', 'org-1', 'user-1'),
      ).rejects.toThrow(BranchNotActiveError);
    });

    it('ném BranchHasActiveWarehouseError khi còn Warehouse ACTIVE', async () => {
      makeClient({ activeWarehouseCount: 2 });
      await expect(
        repository.archive('branch-1', 'org-1', 'user-1'),
      ).rejects.toThrow(BranchHasActiveWarehouseError);
    });

    it('ném BranchOrganizationMinOneActiveError khi là Branch ACTIVE cuối cùng', async () => {
      makeClient({ otherActiveBranches: 0 });
      await expect(
        repository.archive('branch-1', 'org-1', 'user-1'),
      ).rejects.toThrow(BranchOrganizationMinOneActiveError);
    });

    it('archive thành công khi đủ điều kiện, tự bỏ isMain', async () => {
      const client = makeClient({});
      const result = await repository.archive('branch-1', 'org-1', 'user-1');
      expect(result.status).toBe('ARCHIVED');
      expect(client.branch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ARCHIVED', isMain: false }),
        }),
      );
    });
  });

  describe('setDefault', () => {
    it('bỏ isMain của các branch khác rồi set true cho branch này, cùng 1 transaction', async () => {
      const client = {
        branch: {
          updateMany: jest.fn().mockResolvedValue({}),
          update: jest.fn().mockResolvedValue({ ...rawBranch, isMain: true }),
        },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(client),
      );

      const result = await repository.setDefault('branch-1', 'org-1', 'user-1');

      expect(client.branch.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          isMain: true,
          id: { not: 'branch-1' },
        },
        data: { isMain: false, updatedBy: 'user-1' },
      });
      expect(client.branch.update).toHaveBeenCalledWith({
        where: { id: 'branch-1' },
        data: { isMain: true, updatedBy: 'user-1' },
      });
      expect(result.isMain).toBe(true);
    });
  });

  describe('existsByInvoicePrefix / countActiveByOrganization', () => {
    it('existsByInvoicePrefix trả về true khi count > 0', async () => {
      prisma.branch.count.mockResolvedValue(1);
      await expect(
        repository.existsByInvoicePrefix('org-1', 'HN'),
      ).resolves.toBe(true);
    });

    it('countActiveByOrganization trả về đúng số lượng', async () => {
      prisma.branch.count.mockResolvedValue(3);
      await expect(repository.countActiveByOrganization('org-1')).resolves.toBe(
        3,
      );
    });
  });
});
