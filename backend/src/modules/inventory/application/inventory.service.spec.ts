import {
  InventoryEntity,
  InventoryMovementEntity,
} from '../domain/entities/inventory.entity';
import { IInventoryRepository } from '../domain/repositories/inventory.repository.interface';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let inventoryRepository: jest.Mocked<IInventoryRepository>;

  const makeInventory = (
    overrides: Partial<InventoryEntity> = {},
  ): InventoryEntity => ({
    id: 'inv-1',
    organizationId: 'org-1',
    warehouseId: 'wh-1',
    productId: 'product-1',
    quantity: '100',
    reservedQty: '10',
    availableQty: '90',
    avgCost: '50',
    lastCost: '50',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });

  const makeMovement = (
    overrides: Partial<InventoryMovementEntity> = {},
  ): InventoryMovementEntity => ({
    id: 'mv-1',
    organizationId: 'org-1',
    warehouseId: 'wh-1',
    productId: 'product-1',
    movementType: 'INITIAL',
    referenceType: 'SYSTEM',
    referenceId: null,
    quantity: '100',
    beforeQuantity: '0',
    afterQuantity: '100',
    unitCost: '50',
    remark: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });

  beforeEach(() => {
    inventoryRepository = {
      search: jest.fn(),
      getByProduct: jest.fn(),
      getHistory: jest.fn(),
      recordMovement: jest.fn(),
      recordSaleMovement: jest.fn(),
    };
    service = new InventoryService(inventoryRepository);
  });

  describe('search', () => {
    it('map query sang search params và trả kết quả phân trang', async () => {
      inventoryRepository.search.mockResolvedValue({
        items: [makeInventory()],
        total: 1,
        page: 1,
        limit: 20,
      });
      const result = await service.search({ warehouseId: 'wh-1' }, 'org-1');
      expect(result.total).toBe(1);
      expect(inventoryRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          warehouseId: 'wh-1',
          page: 1,
          limit: 20,
        }),
      );
    });
  });

  describe('getByProduct', () => {
    it('ủy quyền cho repository.getByProduct', async () => {
      inventoryRepository.getByProduct.mockResolvedValue([makeInventory()]);
      const result = await service.getByProduct('product-1', 'org-1');
      expect(result).toHaveLength(1);
      expect(inventoryRepository.getByProduct).toHaveBeenCalledWith(
        'product-1',
        'org-1',
      );
    });
  });

  describe('getHistory', () => {
    it('map query (kèm khoảng thời gian) sang search params', async () => {
      inventoryRepository.getHistory.mockResolvedValue({
        items: [makeMovement()],
        total: 1,
        page: 1,
        limit: 20,
      });
      const result = await service.getHistory(
        { createdFrom: '2026-01-01', createdTo: '2026-01-31' },
        'org-1',
      );
      expect(result.total).toBe(1);
      expect(inventoryRepository.getHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          createdFrom: new Date('2026-01-01'),
          createdTo: new Date('2026-01-31'),
        }),
      );
    });

    it('không set createdFrom/createdTo khi query không có', async () => {
      inventoryRepository.getHistory.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });
      await service.getHistory({}, 'org-1');
      expect(inventoryRepository.getHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          createdFrom: undefined,
          createdTo: undefined,
        }),
      );
    });
  });
});
