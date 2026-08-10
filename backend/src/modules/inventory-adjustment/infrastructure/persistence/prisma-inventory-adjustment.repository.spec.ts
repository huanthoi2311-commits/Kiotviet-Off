import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { InventoryDomainService } from '../../../inventory/application/inventory-domain.service';
import {
  InventoryConcurrencyConflictError,
  InventoryInsufficientStockError,
} from '../../../inventory/domain/errors/inventory.errors';
import {
  InventoryAdjustmentConcurrencyConflictError,
  InventoryAdjustmentNegativeStockError,
  InventoryAdjustmentStatusConflictError,
} from '../../domain/repositories/inventory-adjustment.repository.interface';
import { PrismaInventoryAdjustmentRepository } from './prisma-inventory-adjustment.repository';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

const rawItem = {
  id: 'item-1',
  adjustmentId: 'adj-1',
  productId: 'product-1',
  quantity: new Prisma.Decimal(-5),
  remark: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

const rawAdjustment = {
  id: 'adj-1',
  organizationId: 'org-1',
  warehouseId: 'wh-1',
  code: 'PDCK000001',
  status: 'DRAFT',
  reason: 'LOST',
  note: null,
  version: 1,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
  items: [rawItem],
};

describe('PrismaInventoryAdjustmentRepository', () => {
  let repository: PrismaInventoryAdjustmentRepository;
  let prisma: {
    inventoryAdjustment: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let inventoryDomainService: jest.Mocked<
    Pick<InventoryDomainService, 'adjust'>
  >;

  beforeEach(() => {
    prisma = {
      inventoryAdjustment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    inventoryDomainService = {
      adjust: jest.fn().mockResolvedValue({ movement: {}, avgCostAfter: '0' }),
    };
    repository = new PrismaInventoryAdjustmentRepository(
      prisma as unknown as PrismaService,
      inventoryDomainService as unknown as InventoryDomainService,
    );
  });

  describe('create', () => {
    const input = {
      organizationId: 'org-1',
      warehouseId: 'wh-1',
      code: 'PDCK000001',
      reason: 'LOST' as const,
      items: [{ productId: 'product-1', quantity: -5 }],
      createdBy: 'user-1',
    };

    it('tạo thành công', async () => {
      prisma.inventoryAdjustment.create.mockResolvedValue(rawAdjustment);
      const result = await repository.create(input);
      expect(result.code).toBe('PDCK000001');
      expect(result.items[0].quantity).toBe('-5');
    });

    it('dịch lỗi P2002 sang ConflictException', async () => {
      prisma.inventoryAdjustment.create.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(repository.create(input)).rejects.toThrow(ConflictException);
    });

    it('ném thẳng lỗi không xác định', async () => {
      prisma.inventoryAdjustment.create.mockRejectedValue(new Error('boom'));
      await expect(repository.create(input)).rejects.toThrow('boom');
    });
  });

  describe('findById', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue(null);
      await expect(repository.findById('missing', 'org-1')).resolves.toBeNull();
    });

    it('map đúng entity kèm items khi tìm thấy', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue(rawAdjustment);
      const result = await repository.findById('adj-1', 'org-1');
      expect(result?.reason).toBe('LOST');
    });
  });

  describe('search', () => {
    it('trả về danh sách phân trang', async () => {
      prisma.$transaction.mockResolvedValueOnce([[rawAdjustment], 1]);
      const result = await repository.search({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(1);
    });
  });

  describe('existsByCode', () => {
    it('true khi tìm thấy', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue({ id: 'adj-1' });
      await expect(
        repository.existsByCode('org-1', 'PDCK000001'),
      ).resolves.toBe(true);
    });
  });

  describe('submit / approve', () => {
    it('submit chuyển DRAFT sang SUBMITTED khi updateMany ảnh hưởng 1 dòng', async () => {
      prisma.inventoryAdjustment.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryAdjustment.findFirst.mockResolvedValue({
        ...rawAdjustment,
        status: 'SUBMITTED',
      });

      const result = await repository.submit('adj-1', 'org-1', 'user-1');
      expect(result.status).toBe('SUBMITTED');
      expect(prisma.inventoryAdjustment.updateMany).toHaveBeenCalledWith({
        where: { id: 'adj-1', organizationId: 'org-1', status: 'DRAFT' },
        data: { status: 'SUBMITTED', updatedBy: 'user-1' },
      });
    });

    it('submit ném StatusConflictError khi không có dòng nào bị ảnh hưởng', async () => {
      prisma.inventoryAdjustment.updateMany.mockResolvedValue({ count: 0 });
      prisma.inventoryAdjustment.findFirst.mockResolvedValue({
        status: 'SUBMITTED',
      });
      await expect(
        repository.submit('adj-1', 'org-1', 'user-1'),
      ).rejects.toThrow(InventoryAdjustmentStatusConflictError);
    });

    it('approve chuyển SUBMITTED sang APPROVED', async () => {
      prisma.inventoryAdjustment.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryAdjustment.findFirst.mockResolvedValue({
        ...rawAdjustment,
        status: 'APPROVED',
      });

      const result = await repository.approve('adj-1', 'org-1', 'user-1');
      expect(result.status).toBe('APPROVED');
      expect(prisma.inventoryAdjustment.updateMany).toHaveBeenCalledWith({
        where: { id: 'adj-1', organizationId: 'org-1', status: 'SUBMITTED' },
        data: { status: 'APPROVED', updatedBy: 'user-1' },
      });
    });
  });

  describe('complete (T051.02 — Optimistic Lock CAS-first)', () => {
    const approvedAdjustment = {
      ...rawAdjustment,
      status: 'APPROVED',
      version: 2,
    };

    function makeTx(options: {
      claimCount?: number;
      statusAfterFailedClaim?: string;
      versionAfterFailedClaim?: number;
    }) {
      const tx = {
        inventoryAdjustment: {
          updateMany: jest
            .fn()
            .mockResolvedValue({ count: options.claimCount ?? 1 }),
          findFirst: jest.fn().mockResolvedValue(
            options.claimCount === 0
              ? {
                  status: options.statusAfterFailedClaim ?? 'DRAFT',
                  version: options.versionAfterFailedClaim ?? 2,
                }
              : approvedAdjustment,
          ),
          findFirstOrThrow: jest.fn().mockResolvedValue(approvedAdjustment),
        },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(tx)),
      );
      return tx;
    }

    it('claim thành công: updateMany với where kèm status=APPROVED và version=expectedVersion', async () => {
      const tx = makeTx({});

      await repository.complete('adj-1', 'org-1', 2, 'user-1');

      expect(tx.inventoryAdjustment.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'adj-1',
          organizationId: 'org-1',
          status: 'APPROVED',
          version: 2,
        },
        data: {
          status: 'COMPLETED',
          version: { increment: 1 },
          updatedBy: 'user-1',
        },
      });
    });

    it('ném StatusConflictError khi claim thất bại, version KHỚP nhưng trạng thái hiện tại không phải APPROVED (invalid-transition thật)', async () => {
      makeTx({
        claimCount: 0,
        statusAfterFailedClaim: 'DRAFT',
        versionAfterFailedClaim: 2,
      });
      await expect(
        repository.complete('adj-1', 'org-1', 2, 'user-1'),
      ).rejects.toThrow(InventoryAdjustmentStatusConflictError);
    });

    it('T051.02: ném InventoryAdjustmentConcurrencyConflictError khi claim thất bại vì version lệch (kể cả khi status hiện tại đã đổi do request thắng cuộc)', async () => {
      makeTx({
        claimCount: 0,
        statusAfterFailedClaim: 'COMPLETED',
        versionAfterFailedClaim: 3,
      });
      await expect(
        repository.complete('adj-1', 'org-1', 1, 'user-1'),
      ).rejects.toThrow(InventoryAdjustmentConcurrencyConflictError);
    });

    it('claim thất bại KHÔNG chạy vòng lặp Inventory (zero business side effects cho request thua)', async () => {
      makeTx({
        claimCount: 0,
        statusAfterFailedClaim: 'COMPLETED',
        versionAfterFailedClaim: 3,
      });
      await expect(
        repository.complete('adj-1', 'org-1', 1, 'user-1'),
      ).rejects.toThrow(InventoryAdjustmentConcurrencyConflictError);
      expect(inventoryDomainService.adjust).not.toHaveBeenCalled();
    });

    it('claim thành công MỚI gọi InventoryDomainService.adjust() đúng tham số cho từng dòng hàng', async () => {
      const tx = makeTx({});

      await repository.complete('adj-1', 'org-1', 2, 'user-1');

      expect(inventoryDomainService.adjust).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          organizationId: 'org-1',
          warehouseId: 'wh-1',
          productId: 'product-1',
          delta: -5,
          movementType: 'ADJUSTMENT',
          referenceType: 'SYSTEM',
          referenceId: 'adj-1',
          createdBy: 'user-1',
        }),
      );
    });

    it('dịch InventoryInsufficientStockError sang InventoryAdjustmentNegativeStockError', async () => {
      makeTx({});
      inventoryDomainService.adjust.mockRejectedValueOnce(
        new InventoryInsufficientStockError('product-1', '2'),
      );

      await expect(
        repository.complete('adj-1', 'org-1', 2, 'user-1'),
      ).rejects.toThrow(InventoryAdjustmentNegativeStockError);
    });

    it('lan truyền nguyên trạng InventoryConcurrencyConflictError (không dịch)', async () => {
      makeTx({});
      inventoryDomainService.adjust.mockRejectedValueOnce(
        new InventoryConcurrencyConflictError('product-1'),
      );

      await expect(
        repository.complete('adj-1', 'org-1', 2, 'user-1'),
      ).rejects.toThrow(InventoryConcurrencyConflictError);
    });
  });
});
