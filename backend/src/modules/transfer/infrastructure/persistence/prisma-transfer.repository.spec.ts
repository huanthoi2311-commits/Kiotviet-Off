import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TransferStatusConflictError } from '../../domain/repositories/transfer.repository.interface';
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
    repository = new PrismaTransferRepository(
      prisma as unknown as PrismaService,
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

  describe('transitionStatus', () => {
    function makeTx(overrides: {
      currentTransfer?: unknown;
      inventory?: unknown;
    }) {
      const transferUpdate = jest.fn().mockResolvedValue(rawTransfer);
      const currentTransfer =
        'currentTransfer' in overrides
          ? overrides.currentTransfer
          : rawTransfer;
      const tx = {
        transfer: {
          findUnique: jest.fn().mockResolvedValue(currentTransfer),
          update: transferUpdate,
        },
        inventory: {
          findUnique: jest.fn().mockResolvedValue(overrides.inventory ?? null),
          upsert: jest.fn().mockResolvedValue({}),
        },
        inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
        transferItem: { update: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(tx)),
      );
      return tx;
    }

    it('ném TransferStatusConflictError khi trạng thái hiện tại không khớp expected', async () => {
      makeTx({ currentTransfer: { ...rawTransfer, status: 'CANCELLED' } });
      await expect(
        repository.transitionStatus(
          'transfer-1',
          ['PENDING'],
          'APPROVED',
          [],
          'user-1',
        ),
      ).rejects.toThrow(TransferStatusConflictError);
    });

    it('ném TransferStatusConflictError khi transfer không còn tồn tại', async () => {
      makeTx({ currentTransfer: null });
      await expect(
        repository.transitionStatus(
          'transfer-1',
          ['PENDING'],
          'APPROVED',
          [],
          'user-1',
        ),
      ).rejects.toThrow(TransferStatusConflictError);
    });

    it('approve: trừ kho nguồn và ghi lại unitCost vào TransferItem khi captureUnitCostToItem=true', async () => {
      const tx = makeTx({
        currentTransfer: { ...rawTransfer, status: 'PENDING' },
        inventory: {
          quantity: new Prisma.Decimal(100),
          avgCost: new Prisma.Decimal(50),
          lastCost: new Prisma.Decimal(50),
        },
      });

      await repository.transitionStatus(
        'transfer-1',
        ['PENDING'],
        'APPROVED',
        [
          {
            transferItemId: 'item-1',
            warehouseId: 'wh-a',
            productId: 'product-1',
            quantity: -10,
            movementType: 'TRANSFER_OUT',
            referenceType: 'TRANSFER',
            captureUnitCostToItem: true,
          },
        ],
        'user-1',
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

      const upsertArg = tx.inventory.upsert.mock.calls[0][0];
      expect(upsertArg.update.quantity.toString()).toBe('90');

      const movementArg = tx.inventoryMovement.create.mock.calls[0][0].data;
      expect(movementArg.quantity.toString()).toBe('-10');
      expect(movementArg.beforeQuantity.toString()).toBe('100');
      expect(movementArg.afterQuantity.toString()).toBe('90');

      expect(tx.transfer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'transfer-1' },
          data: { status: 'APPROVED', updatedBy: 'user-1' },
        }),
      );
    });

    it('receive: cộng kho đích với unitCost đã ghi lại lúc Approve', async () => {
      const tx = makeTx({
        currentTransfer: { ...rawTransfer, status: 'APPROVED' },
        inventory: null,
      });

      await repository.transitionStatus(
        'transfer-1',
        ['APPROVED'],
        'RECEIVED',
        [
          {
            transferItemId: 'item-1',
            warehouseId: 'wh-b',
            productId: 'product-1',
            quantity: 10,
            unitCost: 50,
            movementType: 'TRANSFER_IN',
            referenceType: 'TRANSFER',
          },
        ],
        'user-1',
      );

      const createArg = tx.inventory.upsert.mock.calls[0][0].create;
      expect(createArg.quantity.toString()).toBe('10');
      expect(createArg.avgCost.toString()).toBe('50');
    });

    it('cancel không kèm movement chỉ đổi trạng thái, không đụng Inventory', async () => {
      const tx = makeTx({
        currentTransfer: { ...rawTransfer, status: 'PENDING' },
      });

      await repository.transitionStatus(
        'transfer-1',
        ['PENDING'],
        'CANCELLED',
        [],
        'user-1',
      );

      expect(tx.inventory.upsert).not.toHaveBeenCalled();
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
      expect(tx.transfer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'CANCELLED', updatedBy: 'user-1' },
        }),
      );
    });
  });
});
