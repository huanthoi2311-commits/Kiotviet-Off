import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { InventoryDomainService } from '../../../inventory/application/inventory-domain.service';
import {
  PurchaseOrderConcurrencyConflictError,
  PurchaseOrderStatusConflictError,
} from '../../domain/repositories/purchase-order.repository.interface';
import { PrismaPurchaseOrderRepository } from './prisma-purchase-order.repository';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

const rawItem = {
  id: 'item-1',
  purchaseOrderId: 'po-1',
  productId: 'product-1',
  warehouseId: 'wh-1',
  quantity: new Prisma.Decimal(100),
  receivedQuantity: new Prisma.Decimal(0),
  unitCost: new Prisma.Decimal(10000),
  discount: new Prisma.Decimal(0),
  taxAmount: new Prisma.Decimal(0),
  totalAmount: new Prisma.Decimal(1000000),
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

const rawOrder = {
  id: 'po-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  supplierId: 'supplier-1',
  code: 'PN000001',
  status: 'DRAFT',
  totalAmount: new Prisma.Decimal(1000000),
  paidAmount: new Prisma.Decimal(0),
  expectedAt: null,
  version: 1,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
  purchaseItems: [rawItem],
};

describe('PrismaPurchaseOrderRepository', () => {
  let repository: PrismaPurchaseOrderRepository;
  let prisma: {
    purchaseOrder: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let inventoryDomainService: jest.Mocked<
    Pick<InventoryDomainService, 'increase'>
  >;

  beforeEach(() => {
    prisma = {
      purchaseOrder: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    inventoryDomainService = {
      increase: jest.fn().mockResolvedValue({
        movement: {},
        avgCostAfter: '0',
      }),
    };
    repository = new PrismaPurchaseOrderRepository(
      prisma as unknown as PrismaService,
      inventoryDomainService as unknown as InventoryDomainService,
    );
  });

  describe('create', () => {
    const input = {
      organizationId: 'org-1',
      branchId: 'branch-1',
      supplierId: 'supplier-1',
      code: 'PN000001',
      totalAmount: 1000000,
      items: [
        {
          productId: 'product-1',
          warehouseId: 'wh-1',
          quantity: 100,
          unitCost: 10000,
          discount: 0,
          taxAmount: 0,
          totalAmount: 1000000,
        },
      ],
      createdBy: 'user-1',
    };

    it('tạo thành công', async () => {
      prisma.purchaseOrder.create.mockResolvedValue(rawOrder);
      const result = await repository.create(input);
      expect(result.code).toBe('PN000001');
      expect(result.items[0].warehouseId).toBe('wh-1');
      expect(result.items[0].quantity).toBe('100');
    });

    it('dịch lỗi P2002 sang ConflictException', async () => {
      prisma.purchaseOrder.create.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(repository.create(input)).rejects.toThrow(ConflictException);
    });

    it('dịch lỗi P2003 sang BadRequestException', async () => {
      prisma.purchaseOrder.create.mockRejectedValue(
        knownError('P2003', { field_name: 'purchase_items_warehouseId_fkey' }),
      );
      await expect(repository.create(input)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('ném thẳng lỗi không xác định', async () => {
      prisma.purchaseOrder.create.mockRejectedValue(new Error('boom'));
      await expect(repository.create(input)).rejects.toThrow('boom');
    });
  });

  describe('findById', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(null);
      await expect(repository.findById('missing', 'org-1')).resolves.toBeNull();
    });

    it('map đúng entity kèm items khi tìm thấy', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(rawOrder);
      const result = await repository.findById('po-1', 'org-1');
      expect(result?.code).toBe('PN000001');
    });
  });

  describe('search', () => {
    it('trả về danh sách phân trang', async () => {
      prisma.$transaction.mockResolvedValueOnce([[rawOrder], 1]);
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
      prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po-1' });
      await expect(repository.existsByCode('org-1', 'PN000001')).resolves.toBe(
        true,
      );
    });
  });

  describe('approve / cancel (transitionSimple)', () => {
    it('approve chuyển DRAFT sang APPROVED', async () => {
      prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });
      prisma.purchaseOrder.findFirst.mockResolvedValue({
        ...rawOrder,
        status: 'APPROVED',
      });

      const result = await repository.approve('po-1', 'org-1', 'user-1');
      expect(result.status).toBe('APPROVED');
      expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'po-1',
          organizationId: 'org-1',
          status: { in: ['DRAFT'] },
        },
        data: { status: 'APPROVED', updatedBy: 'user-1' },
      });
    });

    it('approve ném StatusConflictError khi không có dòng nào bị ảnh hưởng', async () => {
      prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 0 });
      prisma.purchaseOrder.findFirst.mockResolvedValue({ status: 'APPROVED' });
      await expect(
        repository.approve('po-1', 'org-1', 'user-1'),
      ).rejects.toThrow(PurchaseOrderStatusConflictError);
    });

    it('cancel cho phép từ DRAFT/PENDING/APPROVED', async () => {
      prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });
      prisma.purchaseOrder.findFirst.mockResolvedValue({
        ...rawOrder,
        status: 'CANCELLED',
      });

      const result = await repository.cancel('po-1', 'org-1', 'user-1');
      expect(result.status).toBe('CANCELLED');
      expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'po-1',
          organizationId: 'org-1',
          status: { in: ['DRAFT', 'PENDING', 'APPROVED'] },
        },
        data: { status: 'CANCELLED', updatedBy: 'user-1' },
      });
    });

    it('cancel ném StatusConflictError khi đã RECEIVED', async () => {
      prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 0 });
      prisma.purchaseOrder.findFirst.mockResolvedValue({ status: 'RECEIVED' });
      await expect(
        repository.cancel('po-1', 'org-1', 'user-1'),
      ).rejects.toThrow(PurchaseOrderStatusConflictError);
    });
  });

  describe('receive (T051.02 — Optimistic Lock CAS-first)', () => {
    const approvedOrder = { ...rawOrder, status: 'APPROVED', version: 3 };

    function makeTx(options: {
      claimCount?: number;
      statusAfterFailedClaim?: string;
      versionAfterFailedClaim?: number;
    }) {
      const tx = {
        purchaseOrder: {
          updateMany: jest
            .fn()
            .mockResolvedValue({ count: options.claimCount ?? 1 }),
          findFirst: jest.fn().mockResolvedValue(
            options.claimCount === 0
              ? {
                  status: options.statusAfterFailedClaim ?? 'DRAFT',
                  version: options.versionAfterFailedClaim ?? 3,
                }
              : approvedOrder,
          ),
          findFirstOrThrow: jest.fn().mockResolvedValue(approvedOrder),
        },
        purchaseItem: { update: jest.fn().mockResolvedValue({}) },
        debt: { create: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(tx)),
      );
      return tx;
    }

    it('claim thành công: updateMany với where kèm status=APPROVED và version=expectedVersion', async () => {
      const tx = makeTx({});

      await repository.receive('po-1', 'org-1', 3, 'user-1');

      expect(tx.purchaseOrder.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'po-1',
          organizationId: 'org-1',
          status: 'APPROVED',
          version: 3,
        },
        data: {
          status: 'RECEIVED',
          version: { increment: 1 },
          updatedBy: 'user-1',
        },
      });
    });

    it('ném StatusConflictError khi claim thất bại, version KHỚP nhưng trạng thái hiện tại không phải APPROVED (invalid-transition thật)', async () => {
      makeTx({
        claimCount: 0,
        statusAfterFailedClaim: 'DRAFT',
        versionAfterFailedClaim: 3,
      });
      await expect(
        repository.receive('po-1', 'org-1', 3, 'user-1'),
      ).rejects.toThrow(PurchaseOrderStatusConflictError);
    });

    it('T051.02: ném PurchaseOrderConcurrencyConflictError khi claim thất bại vì version lệch (kể cả khi status hiện tại vẫn nằm trong tập hợp lệ do request thắng cuộc đã đổi status)', async () => {
      makeTx({
        claimCount: 0,
        statusAfterFailedClaim: 'RECEIVED',
        versionAfterFailedClaim: 4,
      });
      await expect(
        repository.receive('po-1', 'org-1', 1, 'user-1'),
      ).rejects.toThrow(PurchaseOrderConcurrencyConflictError);
    });

    it('claim thành công MỚI chạy vòng lặp Inventory: gọi InventoryDomainService.increase() đúng tham số cho từng dòng hàng, cập nhật receivedQuantity', async () => {
      const tx = makeTx({});

      await repository.receive('po-1', 'org-1', 3, 'user-1');

      expect(inventoryDomainService.increase).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          organizationId: 'org-1',
          warehouseId: 'wh-1',
          productId: 'product-1',
          quantity: 100,
          unitCost: 10000,
          movementType: 'PURCHASE',
          referenceType: 'PURCHASE',
          referenceId: 'po-1',
          createdBy: 'user-1',
        }),
      );

      expect(tx.purchaseItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { receivedQuantity: rawItem.quantity, updatedBy: 'user-1' },
      });

      const debtArg = tx.debt.create.mock.calls[0][0].data;
      expect(debtArg.type).toBe('PAYABLE');
      expect(debtArg.supplierId).toBe('supplier-1');
      expect(debtArg.refType).toBe('PurchaseOrder');
      expect(debtArg.refId).toBe('po-1');
      expect(debtArg.amount).toBe(rawOrder.totalAmount);
      expect(debtArg.status).toBe('OPEN');
    });

    it('claim thất bại KHÔNG chạy vòng lặp Inventory (zero business side effects cho request thua)', async () => {
      makeTx({
        claimCount: 0,
        statusAfterFailedClaim: 'RECEIVED',
        versionAfterFailedClaim: 4,
      });
      await expect(
        repository.receive('po-1', 'org-1', 1, 'user-1'),
      ).rejects.toThrow(PurchaseOrderConcurrencyConflictError);
      expect(inventoryDomainService.increase).not.toHaveBeenCalled();
    });

    it('lan truyền lỗi từ InventoryDomainService.increase() (vd Optimistic Lock conflict) sau khi đã claim', async () => {
      makeTx({});
      inventoryDomainService.increase.mockRejectedValueOnce(
        new Error('conflict'),
      );

      await expect(
        repository.receive('po-1', 'org-1', 3, 'user-1'),
      ).rejects.toThrow('conflict');
    });
  });
});
