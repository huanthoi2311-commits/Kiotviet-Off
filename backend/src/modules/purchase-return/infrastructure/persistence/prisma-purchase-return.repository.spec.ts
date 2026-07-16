import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { InventoryDomainService } from '../../../inventory/application/inventory-domain.service';
import {
  InventoryConcurrencyConflictError,
  InventoryInsufficientStockError,
} from '../../../inventory/domain/errors/inventory.errors';
import {
  PurchaseReturnExceedsReceivedError,
  PurchaseReturnNegativeStockError,
  PurchaseReturnStatusConflictError,
} from '../../domain/repositories/purchase-return.repository.interface';
import { PrismaPurchaseReturnRepository } from './prisma-purchase-return.repository';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

const rawItem = {
  id: 'ri-1',
  purchaseReturnId: 'pr-1',
  purchaseItemId: 'item-1',
  productId: 'product-1',
  warehouseId: 'wh-1',
  quantity: new Prisma.Decimal(5),
  unitCost: new Prisma.Decimal(10000),
  totalAmount: new Prisma.Decimal(50000),
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

const rawReturn = {
  id: 'pr-1',
  organizationId: 'org-1',
  purchaseOrderId: 'po-1',
  supplierId: 'supplier-1',
  code: 'PTH000001',
  status: 'DRAFT',
  reason: 'DAMAGED',
  totalAmount: new Prisma.Decimal(50000),
  note: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
  items: [rawItem],
};

describe('PrismaPurchaseReturnRepository', () => {
  let repository: PrismaPurchaseReturnRepository;
  let prisma: {
    purchaseReturn: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let inventoryDomainService: jest.Mocked<
    Pick<InventoryDomainService, 'decrease'>
  >;

  beforeEach(() => {
    prisma = {
      purchaseReturn: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    inventoryDomainService = {
      decrease: jest.fn().mockResolvedValue({
        movement: {},
        avgCostAfter: '0',
      }),
    };
    repository = new PrismaPurchaseReturnRepository(
      prisma as unknown as PrismaService,
      inventoryDomainService as unknown as InventoryDomainService,
    );
  });

  describe('create', () => {
    const input = {
      organizationId: 'org-1',
      purchaseOrderId: 'po-1',
      supplierId: 'supplier-1',
      code: 'PTH000001',
      reason: 'DAMAGED' as const,
      totalAmount: 50000,
      items: [
        {
          purchaseItemId: 'item-1',
          productId: 'product-1',
          warehouseId: 'wh-1',
          quantity: 5,
          unitCost: 10000,
          totalAmount: 50000,
        },
      ],
      createdBy: 'user-1',
    };

    function makeTx(overrides: {
      purchaseItem?: unknown;
      alreadyReturnedSum?: Prisma.Decimal | null;
    }) {
      const tx = {
        purchaseItem: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(
            overrides.purchaseItem ?? {
              id: 'item-1',
              receivedQuantity: new Prisma.Decimal(100),
            },
          ),
        },
        purchaseReturnItem: {
          aggregate: jest.fn().mockResolvedValue({
            _sum: { quantity: overrides.alreadyReturnedSum ?? null },
          }),
        },
        purchaseReturn: {
          create: jest.fn().mockResolvedValue(rawReturn),
        },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(tx)),
      );
      return tx;
    }

    it('tạo thành công khi trong hạn mức đã nhận', async () => {
      makeTx({});
      const result = await repository.create(input);
      expect(result.code).toBe('PTH000001');
      expect(result.items[0].purchaseItemId).toBe('item-1');
    });

    it('ném PurchaseReturnExceedsReceivedError khi vượt quá số lượng đã nhận', async () => {
      makeTx({
        purchaseItem: { id: 'item-1', receivedQuantity: new Prisma.Decimal(3) },
      });
      await expect(repository.create(input)).rejects.toThrow(
        PurchaseReturnExceedsReceivedError,
      );
    });

    it('cộng dồn số lượng đã trả trước đó khi kiểm tra hạn mức', async () => {
      const tx = makeTx({
        purchaseItem: { id: 'item-1', receivedQuantity: new Prisma.Decimal(6) },
        alreadyReturnedSum: new Prisma.Decimal(2),
      });
      // đã trả 2, nhận 6, trả thêm 5 => tổng 7 > 6 => lỗi
      await expect(repository.create(input)).rejects.toThrow(
        PurchaseReturnExceedsReceivedError,
      );
      expect(tx.purchaseReturn.create).not.toHaveBeenCalled();
    });

    it('dịch lỗi P2002 sang ConflictException', async () => {
      prisma.$transaction.mockRejectedValue(knownError('P2002'));
      await expect(repository.create(input)).rejects.toThrow(ConflictException);
    });

    it('dịch lỗi P2003 sang BadRequestException', async () => {
      prisma.$transaction.mockRejectedValue(
        knownError('P2003', {
          field_name: 'purchase_return_items_warehouseId_fkey',
        }),
      );
      await expect(repository.create(input)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findById', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.purchaseReturn.findFirst.mockResolvedValue(null);
      await expect(repository.findById('missing', 'org-1')).resolves.toBeNull();
    });

    it('map đúng entity kèm items khi tìm thấy', async () => {
      prisma.purchaseReturn.findFirst.mockResolvedValue(rawReturn);
      const result = await repository.findById('pr-1', 'org-1');
      expect(result?.code).toBe('PTH000001');
    });
  });

  describe('search', () => {
    it('trả về danh sách phân trang', async () => {
      prisma.$transaction.mockResolvedValueOnce([[rawReturn], 1]);
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
      prisma.purchaseReturn.findFirst.mockResolvedValue({ id: 'pr-1' });
      await expect(repository.existsByCode('org-1', 'PTH000001')).resolves.toBe(
        true,
      );
    });
  });

  describe('approve / cancel (transitionSimple)', () => {
    it('approve chuyển DRAFT sang APPROVED', async () => {
      prisma.purchaseReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.purchaseReturn.findFirst.mockResolvedValue({
        ...rawReturn,
        status: 'APPROVED',
      });

      const result = await repository.approve('pr-1', 'org-1', 'user-1');
      expect(result.status).toBe('APPROVED');
    });

    it('approve ném StatusConflictError khi không có dòng nào bị ảnh hưởng', async () => {
      prisma.purchaseReturn.updateMany.mockResolvedValue({ count: 0 });
      prisma.purchaseReturn.findFirst.mockResolvedValue({ status: 'APPROVED' });
      await expect(
        repository.approve('pr-1', 'org-1', 'user-1'),
      ).rejects.toThrow(PurchaseReturnStatusConflictError);
    });

    it('cancel cho phép từ DRAFT/APPROVED', async () => {
      prisma.purchaseReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.purchaseReturn.findFirst.mockResolvedValue({
        ...rawReturn,
        status: 'CANCELLED',
      });

      const result = await repository.cancel('pr-1', 'org-1', 'user-1');
      expect(result.status).toBe('CANCELLED');
      expect(prisma.purchaseReturn.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'pr-1',
          organizationId: 'org-1',
          status: { in: ['DRAFT', 'APPROVED'] },
        },
        data: { status: 'CANCELLED', updatedBy: 'user-1' },
      });
    });
  });

  describe('complete', () => {
    function makeTx(overrides: { currentReturn?: unknown }) {
      const returnUpdate = jest.fn().mockResolvedValue(rawReturn);
      const currentReturn =
        'currentReturn' in overrides
          ? overrides.currentReturn
          : { ...rawReturn, status: 'APPROVED' };
      const tx = {
        purchaseReturn: {
          findFirst: jest.fn().mockResolvedValue(currentReturn),
          update: returnUpdate,
        },
        debt: { create: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(tx)),
      );
      return tx;
    }

    it('ném StatusConflictError khi không ở trạng thái APPROVED', async () => {
      makeTx({ currentReturn: { ...rawReturn, status: 'DRAFT' } });
      await expect(
        repository.complete('pr-1', 'org-1', 'user-1'),
      ).rejects.toThrow(PurchaseReturnStatusConflictError);
    });

    it('gọi InventoryDomainService.decrease() đúng tham số, ghi Debt PAYABLE âm', async () => {
      const tx = makeTx({});

      await repository.complete('pr-1', 'org-1', 'user-1');

      expect(inventoryDomainService.decrease).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          organizationId: 'org-1',
          warehouseId: 'wh-1',
          productId: 'product-1',
          quantity: 5,
          movementType: 'RETURN',
          referenceType: 'RETURN',
          referenceId: 'pr-1',
          createdBy: 'user-1',
        }),
      );

      const debtArg = tx.debt.create.mock.calls[0][0].data;
      expect(debtArg.type).toBe('PAYABLE');
      expect(debtArg.supplierId).toBe('supplier-1');
      expect(debtArg.refType).toBe('PurchaseReturn');
      expect(debtArg.refId).toBe('pr-1');
      expect(debtArg.amount.toString()).toBe('-50000');
      expect(debtArg.status).toBe('SETTLED');

      expect(tx.purchaseReturn.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pr-1' },
          data: { status: 'COMPLETED', updatedBy: 'user-1' },
        }),
      );
    });

    it('dịch InventoryInsufficientStockError sang PurchaseReturnNegativeStockError', async () => {
      const tx = makeTx({});
      inventoryDomainService.decrease.mockRejectedValueOnce(
        new InventoryInsufficientStockError('product-1', '2'),
      );

      await expect(
        repository.complete('pr-1', 'org-1', 'user-1'),
      ).rejects.toThrow(PurchaseReturnNegativeStockError);
      expect(tx.debt.create).not.toHaveBeenCalled();
      expect(tx.purchaseReturn.update).not.toHaveBeenCalled();
    });

    it('lan truyền nguyên trạng InventoryConcurrencyConflictError (không dịch)', async () => {
      makeTx({});
      inventoryDomainService.decrease.mockRejectedValueOnce(
        new InventoryConcurrencyConflictError('product-1'),
      );

      await expect(
        repository.complete('pr-1', 'org-1', 'user-1'),
      ).rejects.toThrow(InventoryConcurrencyConflictError);
    });
  });
});
