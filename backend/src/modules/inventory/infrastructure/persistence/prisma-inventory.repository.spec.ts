import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  InventoryConcurrencyConflictError,
  InventoryInsufficientStockError,
} from '../../domain/errors/inventory.errors';
import { PrismaInventoryRepository } from './prisma-inventory.repository';

describe('PrismaInventoryRepository', () => {
  let repository: PrismaInventoryRepository;
  let prisma: {
    inventory: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
    inventoryMovement: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const rawInventory = {
    id: 'inv-1',
    organizationId: 'org-1',
    warehouseId: 'wh-1',
    productId: 'product-1',
    quantity: new Prisma.Decimal(100),
    reservedQty: new Prisma.Decimal(10),
    avgCost: new Prisma.Decimal(50),
    lastCost: new Prisma.Decimal(50),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const rawMovement = {
    id: 'mv-1',
    organizationId: 'org-1',
    warehouseId: 'wh-1',
    productId: 'product-1',
    movementType: 'INITIAL',
    referenceType: 'SYSTEM',
    referenceId: null,
    quantity: new Prisma.Decimal(100),
    beforeQuantity: new Prisma.Decimal(0),
    afterQuantity: new Prisma.Decimal(100),
    unitCost: new Prisma.Decimal(50),
    remark: null,
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    prisma = {
      inventory: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      inventoryMovement: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    repository = new PrismaInventoryRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('search', () => {
    it('trả về tồn kho hiện tại kèm availableQty tính toán', async () => {
      prisma.$transaction.mockResolvedValueOnce([[rawInventory], 1]);
      const result = await repository.search({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(1);
      expect(result.items[0].availableQty).toBe('90');
      expect(result.items[0].quantity).toBe('100');
    });
  });

  describe('getByProduct', () => {
    it('trả về danh sách tồn kho theo sản phẩm ở mọi kho', async () => {
      prisma.inventory.findMany.mockResolvedValue([rawInventory]);
      const result = await repository.getByProduct('product-1', 'org-1');
      expect(result).toHaveLength(1);
      expect(prisma.inventory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            productId: 'product-1',
            organizationId: 'org-1',
            deletedAt: null,
          },
        }),
      );
    });
  });

  describe('getHistory', () => {
    it('trả về danh sách movement phân trang', async () => {
      prisma.$transaction.mockResolvedValueOnce([[rawMovement], 1]);
      const result = await repository.getHistory({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(1);
      expect(result.items[0].movementType).toBe('INITIAL');
    });

    it('thêm điều kiện khoảng thời gian khi có createdFrom/createdTo', async () => {
      prisma.$transaction.mockResolvedValueOnce([[], 0]);
      await repository.getHistory({
        organizationId: 'org-1',
        createdFrom: new Date('2026-01-01'),
        createdTo: new Date('2026-01-31'),
        page: 1,
        limit: 20,
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('recordMovement (SPEC-INV-001, T004 — Optimistic Lock cho mọi movementType)', () => {
    function makeClient(overrides: {
      existingInventory?: unknown;
      settingValue?: unknown;
      updateManyCount?: number;
    }) {
      return {
        inventory: {
          findUnique: jest
            .fn()
            .mockResolvedValue(overrides.existingInventory ?? null),
          updateMany: jest
            .fn()
            .mockResolvedValue({ count: overrides.updateManyCount ?? 1 }),
          create: jest.fn().mockResolvedValue({}),
        },
        inventoryMovement: {
          create: jest.fn().mockResolvedValue(rawMovement),
        },
        setting: {
          findFirst: jest
            .fn()
            .mockResolvedValue(
              overrides.settingValue === undefined
                ? null
                : { value: overrides.settingValue },
            ),
        },
      };
    }

    const baseInput = {
      organizationId: 'org-1',
      warehouseId: 'wh-1',
      productId: 'product-1',
      movementType: 'PURCHASE' as const,
      referenceType: 'PURCHASE' as const,
      createdBy: 'user-1',
    };

    it('không tự mở $transaction — dùng thẳng tx được truyền vào', async () => {
      const client = makeClient({
        existingInventory: {
          quantity: new Prisma.Decimal(100),
          avgCost: new Prisma.Decimal(50),
        },
      });

      await repository.recordMovement(
        client as unknown as Prisma.TransactionClient,
        {
          ...baseInput,
          quantity: 50,
          unitCost: 80,
          checkNegativeStock: false,
        },
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(client.inventory.updateMany).toHaveBeenCalled();
    });

    it('khởi tạo Inventory mới khi chưa tồn tại (nhập kho lần đầu)', async () => {
      const client = makeClient({
        existingInventory: null,
        updateManyCount: 0,
      });

      const result = await repository.recordMovement(
        client as unknown as Prisma.TransactionClient,
        {
          ...baseInput,
          movementType: 'INITIAL',
          quantity: 100,
          unitCost: 50,
          checkNegativeStock: false,
        },
      );

      expect(result.movement.afterQuantity).toBe('100');
      expect(result.avgCostAfter).toBe('50');
      const createArg = client.inventory.create.mock.calls[0][0];
      expect(createArg.data.quantity.toString()).toBe('100');
      expect(createArg.data.avgCost.toString()).toBe('50');
    });

    it('tính lại Average Cost khi nhập kho thêm với đơn giá khác', async () => {
      const client = makeClient({
        existingInventory: {
          quantity: new Prisma.Decimal(100),
          avgCost: new Prisma.Decimal(50),
          lastCost: new Prisma.Decimal(50),
        },
      });

      const result = await repository.recordMovement(
        client as unknown as Prisma.TransactionClient,
        { ...baseInput, quantity: 50, unitCost: 80, checkNegativeStock: false },
      );

      // (100*50 + 50*80) / 150 = 60
      const updateArg = client.inventory.updateMany.mock.calls[0][0];
      expect(updateArg.data.quantity.toString()).toBe('150');
      expect(updateArg.data.avgCost.toString()).toBe('60');
      expect(result.avgCostAfter).toBe('60');
    });

    it('xuất kho không tính lại Average Cost, giữ nguyên avgCost/lastCost', async () => {
      const client = makeClient({
        existingInventory: {
          quantity: new Prisma.Decimal(150),
          avgCost: new Prisma.Decimal(60),
          lastCost: new Prisma.Decimal(80),
        },
      });

      await repository.recordMovement(
        client as unknown as Prisma.TransactionClient,
        {
          ...baseInput,
          movementType: 'SALE',
          referenceType: 'POS',
          quantity: -30,
          checkNegativeStock: true,
        },
      );

      const updateArg = client.inventory.updateMany.mock.calls[0][0];
      expect(updateArg.data.quantity.toString()).toBe('120');
      expect(updateArg.data.avgCost.toString()).toBe('60');
      expect(updateArg.data.lastCost.toString()).toBe('80');
    });

    it('ghi đúng before/afterQuantity vào InventoryMovement', async () => {
      const client = makeClient({
        existingInventory: {
          quantity: new Prisma.Decimal(150),
          avgCost: new Prisma.Decimal(60),
        },
      });

      await repository.recordMovement(
        client as unknown as Prisma.TransactionClient,
        {
          ...baseInput,
          movementType: 'SALE',
          referenceType: 'POS',
          quantity: -30,
          checkNegativeStock: true,
        },
      );

      const createArg = client.inventoryMovement.create.mock.calls[0][0].data;
      expect(createArg.beforeQuantity.toString()).toBe('150');
      expect(createArg.afterQuantity.toString()).toBe('120');
      expect(createArg.quantity.toString()).toBe('-30');
    });

    it('trừ đúng tồn kho qua updateMany điều kiện quantity = beforeQuantity khi checkNegativeStock=true', async () => {
      const client = makeClient({
        existingInventory: { quantity: new Prisma.Decimal(100) },
      });

      const result = await repository.recordMovement(
        client as unknown as Prisma.TransactionClient,
        {
          ...baseInput,
          movementType: 'SALE',
          referenceType: 'POS',
          referenceId: 'invoice-1',
          quantity: -30,
          checkNegativeStock: true,
        },
      );

      expect(client.inventory.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            warehouseId: 'wh-1',
            productId: 'product-1',
            quantity: new Prisma.Decimal(100),
          }),
          data: expect.objectContaining({
            quantity: new Prisma.Decimal(70),
          }),
        }),
      );
      expect(client.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            movementType: 'SALE',
            referenceType: 'POS',
            referenceId: 'invoice-1',
          }),
        }),
      );
      expect(result.movement.id).toBe('mv-1');
    });

    it('ném InventoryInsufficientStockError khi không đủ tồn kho, checkNegativeStock=true và allowNegativeStock=false (mặc định)', async () => {
      const client = makeClient({
        existingInventory: { quantity: new Prisma.Decimal(10) },
      });

      await expect(
        repository.recordMovement(
          client as unknown as Prisma.TransactionClient,
          {
            ...baseInput,
            movementType: 'SALE',
            referenceType: 'POS',
            quantity: -30,
            checkNegativeStock: true,
          },
        ),
      ).rejects.toThrow(InventoryInsufficientStockError);
      expect(client.inventory.updateMany).not.toHaveBeenCalled();
    });

    it('bỏ qua kiểm tra âm kho khi checkNegativeStock=false dù afterQuantity < 0', async () => {
      const client = makeClient({
        existingInventory: { quantity: new Prisma.Decimal(10) },
      });

      await repository.recordMovement(
        client as unknown as Prisma.TransactionClient,
        {
          ...baseInput,
          movementType: 'ADJUSTMENT',
          referenceType: 'SYSTEM',
          quantity: -30,
          checkNegativeStock: false,
        },
      );

      expect(client.setting.findFirst).not.toHaveBeenCalled();
      expect(client.inventory.updateMany).toHaveBeenCalled();
    });

    it('cho phép âm kho khi checkNegativeStock=true và setting inventory.allowNegativeStock = true', async () => {
      const client = makeClient({
        existingInventory: { quantity: new Prisma.Decimal(10) },
        settingValue: true,
      });

      await repository.recordMovement(
        client as unknown as Prisma.TransactionClient,
        {
          ...baseInput,
          movementType: 'SALE',
          referenceType: 'POS',
          quantity: -30,
          checkNegativeStock: true,
        },
      );

      expect(client.inventory.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quantity: new Prisma.Decimal(-20),
          }),
        }),
      );
    });

    it('ném InventoryConcurrencyConflictError khi updateMany không khớp dòng nào (tồn kho đã đổi do giao dịch khác)', async () => {
      const client = makeClient({
        existingInventory: { quantity: new Prisma.Decimal(100) },
        updateManyCount: 0,
      });

      await expect(
        repository.recordMovement(
          client as unknown as Prisma.TransactionClient,
          {
            ...baseInput,
            movementType: 'SALE',
            referenceType: 'POS',
            quantity: -30,
            checkNegativeStock: true,
          },
        ),
      ).rejects.toThrow(InventoryConcurrencyConflictError);
    });

    it('tạo mới Inventory (quantity âm) khi chưa từng có dòng nào và allowNegativeStock=true', async () => {
      const client = makeClient({
        existingInventory: null,
        settingValue: true,
        // Chưa từng có dòng Inventory nào -> updateMany (WHERE quantity=0) không khớp dòng
        // nào trong Postgres thật, luôn trả count=0 -> đi vào nhánh tạo mới bên dưới.
        updateManyCount: 0,
      });

      await repository.recordMovement(
        client as unknown as Prisma.TransactionClient,
        {
          ...baseInput,
          movementType: 'SALE',
          referenceType: 'POS',
          quantity: -30,
          checkNegativeStock: true,
        },
      );

      expect(client.inventory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quantity: new Prisma.Decimal(-30),
          }),
        }),
      );
    });
  });
});
