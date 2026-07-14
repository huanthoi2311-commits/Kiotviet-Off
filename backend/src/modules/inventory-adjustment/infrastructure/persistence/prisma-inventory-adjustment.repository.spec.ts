import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
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
    repository = new PrismaInventoryAdjustmentRepository(
      prisma as unknown as PrismaService,
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

  describe('complete', () => {
    function makeTx(overrides: {
      currentAdjustment?: unknown;
      inventory?: unknown;
      setting?: unknown;
    }) {
      const adjustmentUpdate = jest.fn().mockResolvedValue(rawAdjustment);
      const currentAdjustment =
        'currentAdjustment' in overrides
          ? overrides.currentAdjustment
          : { ...rawAdjustment, status: 'APPROVED' };
      const tx = {
        inventoryAdjustment: {
          findFirst: jest.fn().mockResolvedValue(currentAdjustment),
          update: adjustmentUpdate,
        },
        setting: {
          findFirst: jest.fn().mockResolvedValue(overrides.setting ?? null),
        },
        inventory: {
          findUnique: jest.fn().mockResolvedValue(overrides.inventory ?? null),
          upsert: jest.fn().mockResolvedValue({}),
        },
        inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(tx)),
      );
      return tx;
    }

    it('ném StatusConflictError khi không ở trạng thái APPROVED', async () => {
      makeTx({ currentAdjustment: { ...rawAdjustment, status: 'DRAFT' } });
      await expect(
        repository.complete('adj-1', 'org-1', 'user-1'),
      ).rejects.toThrow(InventoryAdjustmentStatusConflictError);
    });

    it('ghi đúng Movement ADJUSTMENT và cập nhật Inventory khi đủ tồn kho', async () => {
      const tx = makeTx({
        inventory: {
          quantity: new Prisma.Decimal(10),
          avgCost: new Prisma.Decimal(50),
          lastCost: new Prisma.Decimal(50),
        },
      });

      await repository.complete('adj-1', 'org-1', 'user-1');

      const upsertArg = tx.inventory.upsert.mock.calls[0][0];
      expect(upsertArg.update.quantity.toString()).toBe('5');

      const movementArg = tx.inventoryMovement.create.mock.calls[0][0].data;
      expect(movementArg.movementType).toBe('ADJUSTMENT');
      expect(movementArg.referenceType).toBe('SYSTEM');
      expect(movementArg.quantity.toString()).toBe('-5');
      expect(movementArg.beforeQuantity.toString()).toBe('10');
      expect(movementArg.afterQuantity.toString()).toBe('5');

      expect(tx.inventoryAdjustment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'adj-1' },
          data: { status: 'COMPLETED', updatedBy: 'user-1' },
        }),
      );
    });

    it('ném NegativeStockError khi sẽ âm tồn kho và Setting không cho phép', async () => {
      const tx = makeTx({
        inventory: {
          quantity: new Prisma.Decimal(2),
          avgCost: new Prisma.Decimal(50),
          lastCost: new Prisma.Decimal(50),
        },
        setting: null,
      });

      await expect(
        repository.complete('adj-1', 'org-1', 'user-1'),
      ).rejects.toThrow(InventoryAdjustmentNegativeStockError);
      expect(tx.inventory.upsert).not.toHaveBeenCalled();
      expect(tx.inventoryAdjustment.update).not.toHaveBeenCalled();
    });

    it('cho phép âm tồn kho khi Setting inventory.allowNegativeStock = true', async () => {
      const tx = makeTx({
        inventory: {
          quantity: new Prisma.Decimal(2),
          avgCost: new Prisma.Decimal(50),
          lastCost: new Prisma.Decimal(50),
        },
        setting: { value: true },
      });

      await repository.complete('adj-1', 'org-1', 'user-1');

      const upsertArg = tx.inventory.upsert.mock.calls[0][0];
      expect(upsertArg.update.quantity.toString()).toBe('-3');
      expect(tx.inventoryAdjustment.update).toHaveBeenCalled();
    });
  });
});
