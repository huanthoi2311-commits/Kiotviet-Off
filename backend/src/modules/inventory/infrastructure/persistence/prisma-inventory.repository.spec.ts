import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  InventoryConcurrencyConflictError,
  InventoryInsufficientStockError,
} from '../../domain/repositories/inventory.repository.interface';
import { PrismaInventoryRepository } from './prisma-inventory.repository';

describe('PrismaInventoryRepository', () => {
  let repository: PrismaInventoryRepository;
  let prisma: {
    inventory: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
    };
    inventoryMovement: {
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
    };
    setting: {
      findFirst: jest.Mock;
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
        findUnique: jest.fn(),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      inventoryMovement: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      setting: {
        findFirst: jest.fn(),
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

  describe('recordMovement', () => {
    function mockTransaction(tx: {
      inventory: { findUnique: jest.Mock; upsert: jest.Mock };
      inventoryMovement: { create: jest.Mock };
    }) {
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(tx)),
      );
    }

    it('khởi tạo Inventory mới khi chưa tồn tại (INITIAL, nhập kho)', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const upsert = jest.fn().mockResolvedValue({});
      const create = jest.fn().mockResolvedValue(rawMovement);
      mockTransaction({
        inventory: { findUnique, upsert },
        inventoryMovement: { create },
      });

      const result = await repository.recordMovement({
        organizationId: 'org-1',
        warehouseId: 'wh-1',
        productId: 'product-1',
        movementType: 'INITIAL',
        referenceType: 'SYSTEM',
        quantity: 100,
        unitCost: 50,
        createdBy: 'user-1',
      });

      expect(result.afterQuantity).toBe('100');
      const upsertArg = upsert.mock.calls[0][0];
      expect(upsertArg.create.quantity.toString()).toBe('100');
      expect(upsertArg.create.avgCost.toString()).toBe('50');
      expect(upsertArg.create.lastCost.toString()).toBe('50');
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            beforeQuantity: expect.any(Prisma.Decimal),
            afterQuantity: expect.any(Prisma.Decimal),
          }),
        }),
      );
    });

    it('tính lại Average Cost khi nhập kho thêm với đơn giá khác', async () => {
      const findUnique = jest.fn().mockResolvedValue({
        ...rawInventory,
        quantity: new Prisma.Decimal(100),
        avgCost: new Prisma.Decimal(50),
      });
      const upsert = jest.fn().mockResolvedValue({});
      const create = jest.fn().mockResolvedValue(rawMovement);
      mockTransaction({
        inventory: { findUnique, upsert },
        inventoryMovement: { create },
      });

      await repository.recordMovement({
        organizationId: 'org-1',
        warehouseId: 'wh-1',
        productId: 'product-1',
        movementType: 'PURCHASE',
        referenceType: 'PURCHASE',
        quantity: 50,
        unitCost: 80,
        createdBy: 'user-1',
      });

      const updateArg = upsert.mock.calls[0][0].update;
      // (100*50 + 50*80) / 150 = 60
      expect(updateArg.quantity.toString()).toBe('150');
      expect(updateArg.avgCost.toString()).toBe('60');
      expect(updateArg.lastCost.toString()).toBe('80');
    });

    it('xuất kho không tính lại Average Cost, giữ nguyên avgCost/lastCost', async () => {
      const findUnique = jest.fn().mockResolvedValue({
        ...rawInventory,
        quantity: new Prisma.Decimal(150),
        avgCost: new Prisma.Decimal(60),
        lastCost: new Prisma.Decimal(80),
      });
      const upsert = jest.fn().mockResolvedValue({});
      const create = jest.fn().mockResolvedValue(rawMovement);
      mockTransaction({
        inventory: { findUnique, upsert },
        inventoryMovement: { create },
      });

      await repository.recordMovement({
        organizationId: 'org-1',
        warehouseId: 'wh-1',
        productId: 'product-1',
        movementType: 'SALE',
        referenceType: 'POS',
        quantity: -30,
        createdBy: 'user-1',
      });

      const updateArg = upsert.mock.calls[0][0].update;
      expect(updateArg.quantity.toString()).toBe('120');
      expect(updateArg.avgCost.toString()).toBe('60');
      expect(updateArg.lastCost.toString()).toBe('80');
    });

    it('ghi đúng before/afterQuantity vào InventoryMovement', async () => {
      const findUnique = jest.fn().mockResolvedValue({
        ...rawInventory,
        quantity: new Prisma.Decimal(150),
        avgCost: new Prisma.Decimal(60),
      });
      const upsert = jest.fn().mockResolvedValue({});
      const create = jest.fn().mockResolvedValue(rawMovement);
      mockTransaction({
        inventory: { findUnique, upsert },
        inventoryMovement: { create },
      });

      await repository.recordMovement({
        organizationId: 'org-1',
        warehouseId: 'wh-1',
        productId: 'product-1',
        movementType: 'SALE',
        referenceType: 'POS',
        quantity: -30,
        createdBy: 'user-1',
      });

      const createArg = create.mock.calls[0][0].data;
      expect(createArg.beforeQuantity.toString()).toBe('150');
      expect(createArg.afterQuantity.toString()).toBe('120');
      expect(createArg.quantity.toString()).toBe('-30');
    });
  });

  describe('recordSaleMovement (Prompt 035 — Optimistic Lock, không âm kho)', () => {
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

    const input = {
      organizationId: 'org-1',
      warehouseId: 'wh-1',
      productId: 'product-1',
      quantity: 30,
      referenceId: 'invoice-1',
      createdBy: 'user-1',
    };

    it('trừ đúng tồn kho qua updateMany điều kiện quantity = beforeQuantity, ghi movement SALE/POS', async () => {
      const client = makeClient({
        existingInventory: { quantity: new Prisma.Decimal(100) },
      });
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(client)),
      );

      const result = await repository.recordSaleMovement(input);

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
      expect(result.id).toBe('mv-1');
    });

    it('ném InventoryInsufficientStockError khi không đủ tồn kho và allowNegativeStock=false (mặc định)', async () => {
      const client = makeClient({
        existingInventory: { quantity: new Prisma.Decimal(10) },
      });
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(client)),
      );

      await expect(repository.recordSaleMovement(input)).rejects.toThrow(
        InventoryInsufficientStockError,
      );
      expect(client.inventory.updateMany).not.toHaveBeenCalled();
    });

    it('cho phép âm kho khi setting inventory.allowNegativeStock = true', async () => {
      const client = makeClient({
        existingInventory: { quantity: new Prisma.Decimal(10) },
        settingValue: true,
      });
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(client)),
      );

      await repository.recordSaleMovement(input);
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
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(client)),
      );

      await expect(repository.recordSaleMovement(input)).rejects.toThrow(
        InventoryConcurrencyConflictError,
      );
    });

    it('tạo mới Inventory (quantity âm) khi chưa từng có dòng nào và allowNegativeStock=true', async () => {
      const client = makeClient({
        existingInventory: null,
        settingValue: true,
        // Chưa từng có dòng Inventory nào -> updateMany (WHERE quantity=0) không khớp dòng
        // nào trong Postgres thật, luôn trả count=0 -> đi vào nhánh tạo mới bên dưới.
        updateManyCount: 0,
      });
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(client)),
      );

      await repository.recordSaleMovement(input);
      expect(client.inventory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quantity: new Prisma.Decimal(-30),
          }),
        }),
      );
    });

    it('dùng thẳng tx được truyền vào, không tự mở $transaction mới', async () => {
      const client = makeClient({
        existingInventory: { quantity: new Prisma.Decimal(100) },
      });

      await repository.recordSaleMovement(
        input,
        client as unknown as Prisma.TransactionClient,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(client.inventory.updateMany).toHaveBeenCalled();
    });
  });
});
