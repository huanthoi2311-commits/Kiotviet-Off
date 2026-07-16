import { Prisma } from '@prisma/client';
import { InventoryMovementEntity } from '../domain/entities/inventory.entity';
import { IInventoryRepository } from '../domain/repositories/inventory.repository.interface';
import { InventoryDomainService } from './inventory-domain.service';

describe('InventoryDomainService', () => {
  let service: InventoryDomainService;
  let inventoryRepository: jest.Mocked<IInventoryRepository>;
  const tx = {} as Prisma.TransactionClient;

  const makeMovement = (
    overrides: Partial<InventoryMovementEntity> = {},
  ): InventoryMovementEntity => ({
    id: 'mv-1',
    organizationId: 'org-1',
    warehouseId: 'wh-1',
    productId: 'product-1',
    movementType: 'PURCHASE',
    referenceType: 'PURCHASE',
    referenceId: null,
    quantity: '10',
    beforeQuantity: '0',
    afterQuantity: '10',
    unitCost: '1000',
    remark: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });

  beforeEach(() => {
    inventoryRepository = {
      search: jest.fn(),
      getByProduct: jest.fn(),
      getHistory: jest.fn(),
      recordMovement: jest
        .fn()
        .mockResolvedValue({ movement: makeMovement(), avgCostAfter: '1000' }),
    };
    service = new InventoryDomainService(inventoryRepository);
  });

  describe('increase', () => {
    it('gọi recordMovement với quantity dương, checkNegativeStock=false', async () => {
      await service.increase(tx, {
        organizationId: 'org-1',
        warehouseId: 'wh-1',
        productId: 'product-1',
        quantity: 10,
        unitCost: 1000,
        movementType: 'PURCHASE',
        referenceType: 'PURCHASE',
        referenceId: 'po-1',
        createdBy: 'user-1',
      });

      expect(inventoryRepository.recordMovement).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          quantity: 10,
          unitCost: 1000,
          checkNegativeStock: false,
          movementType: 'PURCHASE',
          referenceType: 'PURCHASE',
          referenceId: 'po-1',
        }),
      );
    });

    it('mặc định referenceId về null khi không truyền', async () => {
      await service.increase(tx, {
        organizationId: 'org-1',
        warehouseId: 'wh-1',
        productId: 'product-1',
        quantity: 10,
        unitCost: 1000,
        movementType: 'INITIAL',
        referenceType: 'SYSTEM',
        createdBy: 'user-1',
      });

      expect(inventoryRepository.recordMovement).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ referenceId: null }),
      );
    });
  });

  describe('decrease', () => {
    it('quy đổi quantity dương thành delta âm, checkNegativeStock=true, unitCost=null', async () => {
      await service.decrease(tx, {
        organizationId: 'org-1',
        warehouseId: 'wh-1',
        productId: 'product-1',
        quantity: 5,
        movementType: 'RETURN',
        referenceType: 'RETURN',
        createdBy: 'user-1',
      });

      expect(inventoryRepository.recordMovement).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          quantity: -5,
          unitCost: null,
          checkNegativeStock: true,
          movementType: 'RETURN',
        }),
      );
    });
  });

  describe('adjust', () => {
    it('ADJUSTMENT: checkNegativeStock=true, giữ nguyên dấu delta', async () => {
      await service.adjust(tx, {
        organizationId: 'org-1',
        warehouseId: 'wh-1',
        productId: 'product-1',
        delta: -3,
        movementType: 'ADJUSTMENT',
        referenceType: 'SYSTEM',
        createdBy: 'user-1',
      });

      expect(inventoryRepository.recordMovement).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ quantity: -3, checkNegativeStock: true }),
      );
    });

    it('COUNT: checkNegativeStock=false (giữ đúng hành vi hiện có, không chặn kiểm kê)', async () => {
      await service.adjust(tx, {
        organizationId: 'org-1',
        warehouseId: 'wh-1',
        productId: 'product-1',
        delta: 7,
        movementType: 'COUNT',
        referenceType: 'COUNT',
        createdBy: 'user-1',
      });

      expect(inventoryRepository.recordMovement).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ quantity: 7, checkNegativeStock: false }),
      );
    });
  });

  describe('transfer', () => {
    it('OUT: quantity âm, checkNegativeStock=true, unitCost=null, movementType=TRANSFER_OUT', async () => {
      await service.transfer(tx, {
        direction: 'OUT',
        organizationId: 'org-1',
        warehouseId: 'wh-1',
        productId: 'product-1',
        quantity: 8,
        referenceId: 'transfer-1',
        createdBy: 'user-1',
      });

      expect(inventoryRepository.recordMovement).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          quantity: -8,
          unitCost: null,
          checkNegativeStock: true,
          movementType: 'TRANSFER_OUT',
          referenceType: 'TRANSFER',
          referenceId: 'transfer-1',
        }),
      );
    });

    it('IN: quantity dương, checkNegativeStock=false, dùng unitCost đã snapshot, movementType=TRANSFER_IN', async () => {
      await service.transfer(tx, {
        direction: 'IN',
        organizationId: 'org-1',
        warehouseId: 'wh-2',
        productId: 'product-1',
        quantity: 8,
        unitCost: 1234,
        referenceId: 'transfer-1',
        createdBy: 'user-1',
      });

      expect(inventoryRepository.recordMovement).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          quantity: 8,
          unitCost: 1234,
          checkNegativeStock: false,
          movementType: 'TRANSFER_IN',
          referenceType: 'TRANSFER',
        }),
      );
    });

    it('IN: mặc định unitCost và referenceId về null khi không truyền', async () => {
      await service.transfer(tx, {
        direction: 'IN',
        organizationId: 'org-1',
        warehouseId: 'wh-2',
        productId: 'product-1',
        quantity: 8,
        createdBy: 'user-1',
      });

      expect(inventoryRepository.recordMovement).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ unitCost: null, referenceId: null }),
      );
    });
  });

  describe('recordMovement', () => {
    it('ủy quyền thẳng cho repository, trả lại đúng kết quả', async () => {
      const expected = { movement: makeMovement(), avgCostAfter: '999' };
      inventoryRepository.recordMovement.mockResolvedValueOnce(expected);

      const result = await service.recordMovement(tx, {
        organizationId: 'org-1',
        warehouseId: 'wh-1',
        productId: 'product-1',
        movementType: 'DAMAGE',
        referenceType: 'SYSTEM',
        quantity: -1,
        checkNegativeStock: true,
        createdBy: 'user-1',
      });

      expect(result).toBe(expected);
    });
  });
});
