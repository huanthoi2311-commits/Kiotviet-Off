import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { InventoryDomainService } from '../../../inventory/application/inventory-domain.service';
import {
  StockCountItemMismatchError,
  StockCountStatusConflictError,
} from '../../domain/repositories/stock-count.repository.interface';
import { PrismaStockCountRepository } from './prisma-stock-count.repository';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

const rawItem = {
  id: 'item-1',
  stockCountId: 'sc-1',
  productId: 'product-1',
  systemQty: new Prisma.Decimal(100),
  actualQty: null,
  difference: null,
  remark: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

const rawStockCount = {
  id: 'sc-1',
  organizationId: 'org-1',
  warehouseId: 'wh-1',
  code: 'PKK000001',
  status: 'DRAFT',
  note: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
  items: [rawItem],
};

describe('PrismaStockCountRepository', () => {
  let repository: PrismaStockCountRepository;
  let prisma: {
    inventory: { findMany: jest.Mock };
    stockCount: {
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
      inventory: { findMany: jest.fn().mockResolvedValue([]) },
      stockCount: {
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
    repository = new PrismaStockCountRepository(
      prisma as unknown as PrismaService,
      inventoryDomainService as unknown as InventoryDomainService,
    );
  });

  describe('create', () => {
    const input = {
      organizationId: 'org-1',
      warehouseId: 'wh-1',
      code: 'PKK000001',
      productIds: ['product-1'],
      createdBy: 'user-1',
    };

    it('chụp systemQty từ Inventory hiện có', async () => {
      prisma.inventory.findMany.mockResolvedValue([
        { productId: 'product-1', quantity: new Prisma.Decimal(100) },
      ]);
      prisma.stockCount.create.mockResolvedValue(rawStockCount);

      const result = await repository.create(input);

      expect(result.items[0].systemQty).toBe('100');
      const createArg = prisma.stockCount.create.mock.calls[0][0];
      expect(createArg.data.items.create[0].systemQty.toString()).toBe('100');
    });

    it('systemQty = 0 khi sản phẩm chưa có Inventory tại kho', async () => {
      prisma.inventory.findMany.mockResolvedValue([]);
      prisma.stockCount.create.mockResolvedValue(rawStockCount);

      await repository.create(input);

      const createArg = prisma.stockCount.create.mock.calls[0][0];
      expect(createArg.data.items.create[0].systemQty.toString()).toBe('0');
    });

    it('dịch lỗi P2002 sang ConflictException', async () => {
      prisma.stockCount.create.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(repository.create(input)).rejects.toThrow(ConflictException);
    });

    it('ném thẳng lỗi không xác định', async () => {
      prisma.stockCount.create.mockRejectedValue(new Error('boom'));
      await expect(repository.create(input)).rejects.toThrow('boom');
    });
  });

  describe('findById', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.stockCount.findFirst.mockResolvedValue(null);
      await expect(repository.findById('missing', 'org-1')).resolves.toBeNull();
    });

    it('map đúng entity kèm items khi tìm thấy', async () => {
      prisma.stockCount.findFirst.mockResolvedValue(rawStockCount);
      const result = await repository.findById('sc-1', 'org-1');
      expect(result?.items[0].systemQty).toBe('100');
    });
  });

  describe('search', () => {
    it('trả về danh sách phân trang', async () => {
      prisma.$transaction.mockResolvedValueOnce([[rawStockCount], 1]);
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
      prisma.stockCount.findFirst.mockResolvedValue({ id: 'sc-1' });
      await expect(repository.existsByCode('org-1', 'PKK000001')).resolves.toBe(
        true,
      );
    });
  });

  describe('start', () => {
    it('chuyển DRAFT sang COUNTING khi updateMany ảnh hưởng 1 dòng', async () => {
      prisma.stockCount.updateMany.mockResolvedValue({ count: 1 });
      prisma.stockCount.findFirst.mockResolvedValue({
        ...rawStockCount,
        status: 'COUNTING',
      });

      const result = await repository.start('sc-1', 'org-1', 'user-1');
      expect(result.status).toBe('COUNTING');
      expect(prisma.stockCount.updateMany).toHaveBeenCalledWith({
        where: { id: 'sc-1', organizationId: 'org-1', status: 'DRAFT' },
        data: { status: 'COUNTING', updatedBy: 'user-1' },
      });
    });

    it('ném StockCountStatusConflictError khi không có dòng nào bị ảnh hưởng', async () => {
      prisma.stockCount.updateMany.mockResolvedValue({ count: 0 });
      prisma.stockCount.findFirst.mockResolvedValue({ status: 'COUNTING' });

      await expect(repository.start('sc-1', 'org-1', 'user-1')).rejects.toThrow(
        StockCountStatusConflictError,
      );
    });
  });

  describe('complete', () => {
    function makeTx(overrides: { currentStockCount?: unknown }) {
      const stockCountUpdate = jest.fn().mockResolvedValue(rawStockCount);
      const currentStockCount =
        'currentStockCount' in overrides
          ? overrides.currentStockCount
          : { ...rawStockCount, status: 'COUNTING' };
      const tx = {
        stockCount: {
          findFirst: jest.fn().mockResolvedValue(currentStockCount),
          update: stockCountUpdate,
        },
        stockCountItem: { update: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(tx)),
      );
      return tx;
    }

    it('ném StockCountStatusConflictError khi không ở trạng thái COUNTING', async () => {
      makeTx({ currentStockCount: { ...rawStockCount, status: 'DRAFT' } });
      await expect(
        repository.complete(
          'sc-1',
          'org-1',
          [{ itemId: 'item-1', actualQty: 90 }],
          'user-1',
        ),
      ).rejects.toThrow(StockCountStatusConflictError);
    });

    it('ném StockCountItemMismatchError khi itemId không thuộc phiếu', async () => {
      makeTx({});
      await expect(
        repository.complete(
          'sc-1',
          'org-1',
          [{ itemId: 'unknown-item', actualQty: 90 }],
          'user-1',
        ),
      ).rejects.toThrow(StockCountItemMismatchError);
    });

    it('difference = 0 chỉ cập nhật item, không sinh Movement', async () => {
      const tx = makeTx({});
      await repository.complete(
        'sc-1',
        'org-1',
        [{ itemId: 'item-1', actualQty: 100 }],
        'user-1',
      );

      expect(tx.stockCountItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: expect.objectContaining({ updatedBy: 'user-1' }),
      });
      expect(inventoryDomainService.adjust).not.toHaveBeenCalled();
    });

    it('difference ≠ 0 gọi InventoryDomainService.adjust() với movementType=COUNT, delta đúng dấu', async () => {
      const tx = makeTx({});

      await repository.complete(
        'sc-1',
        'org-1',
        [{ itemId: 'item-1', actualQty: 95 }],
        'user-1',
      );

      const itemUpdateArg = tx.stockCountItem.update.mock.calls[0][0].data;
      expect(itemUpdateArg.difference.toString()).toBe('-5');
      expect(itemUpdateArg.actualQty.toString()).toBe('95');

      expect(inventoryDomainService.adjust).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          organizationId: 'org-1',
          warehouseId: 'wh-1',
          productId: 'product-1',
          delta: -5,
          movementType: 'COUNT',
          referenceType: 'COUNT',
          referenceId: 'sc-1',
          createdBy: 'user-1',
        }),
      );

      expect(tx.stockCount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sc-1' },
          data: { status: 'COMPLETED', updatedBy: 'user-1' },
        }),
      );
    });
  });
});
