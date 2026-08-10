import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { InventoryDomainService } from '../../../inventory/application/inventory-domain.service';
import {
  InventoryConcurrencyConflictError,
  InventoryInsufficientStockError,
} from '../../../inventory/domain/errors/inventory.errors';
import {
  TransferConcurrencyConflictError,
  TransferNegativeStockError,
  TransferStatusConflictError,
} from '../../domain/repositories/transfer.repository.interface';
import { PrismaTransferRepository } from './prisma-transfer.repository';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

const rawItem = {
  id: 'item-1',
  transferId: 'transfer-1',
  productId: 'product-1',
  quantity: new Prisma.Decimal(10),
  unitCost: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

const rawTransfer = {
  id: 'transfer-1',
  organizationId: 'org-1',
  fromWarehouseId: 'wh-a',
  toWarehouseId: 'wh-b',
  code: 'PDC000001',
  status: 'PENDING',
  note: null,
  version: 1,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
  items: [rawItem],
};

describe('PrismaTransferRepository', () => {
  let repository: PrismaTransferRepository;
  let prisma: {
    transfer: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let inventoryDomainService: jest.Mocked<
    Pick<InventoryDomainService, 'transfer'>
  >;

  beforeEach(() => {
    prisma = {
      transfer: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    inventoryDomainService = {
      transfer: jest
        .fn()
        .mockResolvedValue({ movement: {}, avgCostAfter: '50' }),
    };
    repository = new PrismaTransferRepository(
      prisma as unknown as PrismaService,
      inventoryDomainService as unknown as InventoryDomainService,
    );
  });

  describe('create', () => {
    const input = {
      organizationId: 'org-1',
      fromWarehouseId: 'wh-a',
      toWarehouseId: 'wh-b',
      code: 'PDC000001',
      items: [{ productId: 'product-1', quantity: 10 }],
      createdBy: 'user-1',
    };

    it('tạo thành công', async () => {
      prisma.transfer.create.mockResolvedValue(rawTransfer);
      const result = await repository.create(input);
      expect(result.code).toBe('PDC000001');
      expect(result.items).toHaveLength(1);
    });

    it('dịch lỗi P2002 sang ConflictException', async () => {
      prisma.transfer.create.mockRejectedValue(
        knownError('P2002', { target: ['code'] }),
      );
      await expect(repository.create(input)).rejects.toThrow(ConflictException);
    });

    it('dịch lỗi P2003 sang BadRequestException', async () => {
      prisma.transfer.create.mockRejectedValue(
        knownError('P2003', { field_name: 'fromWarehouseId' }),
      );
      await expect(repository.create(input)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('ném thẳng lỗi không xác định', async () => {
      prisma.transfer.create.mockRejectedValue(new Error('boom'));
      await expect(repository.create(input)).rejects.toThrow('boom');
    });
  });

  describe('findById', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.transfer.findFirst.mockResolvedValue(null);
      await expect(repository.findById('missing', 'org-1')).resolves.toBeNull();
    });

    it('map đúng entity kèm items khi tìm thấy', async () => {
      prisma.transfer.findFirst.mockResolvedValue(rawTransfer);
      const result = await repository.findById('transfer-1', 'org-1');
      expect(result?.items[0].quantity).toBe('10');
    });
  });

  describe('search', () => {
    it('trả về danh sách phân trang', async () => {
      prisma.$transaction.mockResolvedValueOnce([[rawTransfer], 1]);
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
      prisma.transfer.findFirst.mockResolvedValue({ id: 'transfer-1' });
      await expect(repository.existsByCode('org-1', 'PDC000001')).resolves.toBe(
        true,
      );
    });
  });

  describe('transitionStatus (T051.02 — Optimistic Lock CAS-first)', () => {
    function makeTx(options: {
      claimCount?: number;
      statusAfterFailedClaim?: string | null;
      versionAfterFailedClaim?: number;
      currentForLoop?: unknown;
    }) {
      const current = options.currentForLoop ?? rawTransfer;
      const tx = {
        transfer: {
          updateMany: jest
            .fn()
            .mockResolvedValue({ count: options.claimCount ?? 1 }),
          findFirst: jest.fn().mockResolvedValue(
            options.claimCount === 0
              ? options.statusAfterFailedClaim === null
                ? null
                : {
                    status: options.statusAfterFailedClaim ?? 'CANCELLED',
                    version: options.versionAfterFailedClaim ?? 1,
                  }
              : current,
          ),
          findFirstOrThrow: jest.fn().mockResolvedValue(current),
        },
        transferItem: { update: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(tx)),
      );
      return tx;
    }

    it('claim thành công: updateMany với where kèm status IN expectedStatuses và version=expectedVersion', async () => {
      const tx = makeTx({
        currentForLoop: { ...rawTransfer, status: 'PENDING' },
      });

      await repository.transitionStatus(
        'transfer-1',
        'org-1',
        ['PENDING'],
        'APPROVED',
        1,
        [],
        'user-1',
      );

      expect(tx.transfer.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'transfer-1',
          organizationId: 'org-1',
          status: { in: ['PENDING'] },
          version: 1,
        },
        data: {
          status: 'APPROVED',
          version: { increment: 1 },
          updatedBy: 'user-1',
        },
      });
    });

    it('ném TransferStatusConflictError khi claim thất bại, version KHỚP nhưng trạng thái hiện tại không khớp expected (invalid-transition thật)', async () => {
      makeTx({
        claimCount: 0,
        statusAfterFailedClaim: 'CANCELLED',
        versionAfterFailedClaim: 1,
      });
      await expect(
        repository.transitionStatus(
          'transfer-1',
          'org-1',
          ['PENDING'],
          'APPROVED',
          1,
          [],
          'user-1',
        ),
      ).rejects.toThrow(TransferStatusConflictError);
    });

    it('ném TransferStatusConflictError khi transfer không còn tồn tại', async () => {
      makeTx({ claimCount: 0, statusAfterFailedClaim: null });
      await expect(
        repository.transitionStatus(
          'transfer-1',
          'org-1',
          ['PENDING'],
          'APPROVED',
          1,
          [],
          'user-1',
        ),
      ).rejects.toThrow(TransferStatusConflictError);
    });

    it('T051.02: ném TransferConcurrencyConflictError khi claim thất bại vì version lệch (kể cả khi status hiện tại đã đổi do request thắng cuộc)', async () => {
      makeTx({
        claimCount: 0,
        statusAfterFailedClaim: 'APPROVED',
        versionAfterFailedClaim: 2,
      });
      await expect(
        repository.transitionStatus(
          'transfer-1',
          'org-1',
          ['PENDING'],
          'APPROVED',
          1,
          [],
          'user-1',
        ),
      ).rejects.toThrow(TransferConcurrencyConflictError);
    });

    it('claim thất bại KHÔNG chạy vòng lặp Inventory (zero business side effects cho request thua)', async () => {
      makeTx({
        claimCount: 0,
        statusAfterFailedClaim: 'APPROVED',
        versionAfterFailedClaim: 2,
      });
      await expect(
        repository.transitionStatus(
          'transfer-1',
          'org-1',
          ['PENDING'],
          'APPROVED',
          1,
          [
            {
              transferItemId: 'item-1',
              warehouseId: 'wh-a',
              productId: 'product-1',
              quantity: 10,
              direction: 'OUT',
              captureUnitCostToItem: true,
            },
          ],
          'user-1',
        ),
      ).rejects.toThrow(TransferConcurrencyConflictError);
      expect(inventoryDomainService.transfer).not.toHaveBeenCalled();
    });

    it('approve: claim thành công MỚI gọi InventoryDomainService.transfer() direction=OUT, ghi lại avgCostAfter vào TransferItem.unitCost', async () => {
      const tx = makeTx({
        currentForLoop: { ...rawTransfer, status: 'PENDING' },
      });

      await repository.transitionStatus(
        'transfer-1',
        'org-1',
        ['PENDING'],
        'APPROVED',
        1,
        [
          {
            transferItemId: 'item-1',
            warehouseId: 'wh-a',
            productId: 'product-1',
            quantity: 10,
            direction: 'OUT',
            captureUnitCostToItem: true,
          },
        ],
        'user-1',
      );

      expect(inventoryDomainService.transfer).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          direction: 'OUT',
          organizationId: 'org-1',
          warehouseId: 'wh-a',
          productId: 'product-1',
          quantity: 10,
          referenceId: 'transfer-1',
        }),
      );

      expect(tx.transferItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { unitCost: expect.any(Prisma.Decimal), updatedBy: 'user-1' },
      });
      expect(
        (
          tx.transferItem.update.mock.calls[0][0].data
            .unitCost as Prisma.Decimal
        ).toString(),
      ).toBe('50');
    });

    it('receive: gọi InventoryDomainService.transfer() direction=IN với unitCost đã ghi lại lúc Approve, không đụng TransferItem', async () => {
      const tx = makeTx({
        currentForLoop: { ...rawTransfer, status: 'APPROVED' },
      });

      await repository.transitionStatus(
        'transfer-1',
        'org-1',
        ['APPROVED'],
        'RECEIVED',
        2,
        [
          {
            transferItemId: 'item-1',
            warehouseId: 'wh-b',
            productId: 'product-1',
            quantity: 10,
            unitCost: 50,
            direction: 'IN',
          },
        ],
        'user-1',
      );

      expect(inventoryDomainService.transfer).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          direction: 'IN',
          warehouseId: 'wh-b',
          productId: 'product-1',
          quantity: 10,
          unitCost: 50,
        }),
      );
      expect(tx.transferItem.update).not.toHaveBeenCalled();
    });

    it('dịch InventoryInsufficientStockError (từ lượt OUT) sang TransferNegativeStockError', async () => {
      makeTx({ currentForLoop: { ...rawTransfer, status: 'PENDING' } });
      inventoryDomainService.transfer.mockRejectedValueOnce(
        new InventoryInsufficientStockError('product-1', '5'),
      );

      await expect(
        repository.transitionStatus(
          'transfer-1',
          'org-1',
          ['PENDING'],
          'APPROVED',
          1,
          [
            {
              transferItemId: 'item-1',
              warehouseId: 'wh-a',
              productId: 'product-1',
              quantity: 10,
              direction: 'OUT',
              captureUnitCostToItem: true,
            },
          ],
          'user-1',
        ),
      ).rejects.toThrow(TransferNegativeStockError);
    });

    it('lan truyền nguyên trạng InventoryConcurrencyConflictError (không dịch thành TransferNegativeStockError)', async () => {
      makeTx({ currentForLoop: { ...rawTransfer, status: 'PENDING' } });
      inventoryDomainService.transfer.mockRejectedValueOnce(
        new InventoryConcurrencyConflictError('product-1'),
      );

      await expect(
        repository.transitionStatus(
          'transfer-1',
          'org-1',
          ['PENDING'],
          'APPROVED',
          1,
          [
            {
              transferItemId: 'item-1',
              warehouseId: 'wh-a',
              productId: 'product-1',
              quantity: 10,
              direction: 'OUT',
              captureUnitCostToItem: true,
            },
          ],
          'user-1',
        ),
      ).rejects.toThrow(InventoryConcurrencyConflictError);
    });

    it('cancel không kèm movement chỉ đổi trạng thái, không gọi InventoryDomainService', async () => {
      const tx = makeTx({
        currentForLoop: { ...rawTransfer, status: 'PENDING' },
      });

      await repository.transitionStatus(
        'transfer-1',
        'org-1',
        ['PENDING'],
        'CANCELLED',
        1,
        [],
        'user-1',
      );

      expect(inventoryDomainService.transfer).not.toHaveBeenCalled();
      expect(tx.transfer.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: 'CANCELLED',
            version: { increment: 1 },
            updatedBy: 'user-1',
          },
        }),
      );
    });
  });
});
