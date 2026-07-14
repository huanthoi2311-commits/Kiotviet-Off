import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { InventoryService } from '../application/inventory.service';
import { InventoryController } from './inventory.controller';

describe('InventoryController', () => {
  let controller: InventoryController;
  let inventoryService: jest.Mocked<
    Pick<InventoryService, 'search' | 'getHistory' | 'getByProduct'>
  >;
  const reflector = new Reflector();

  const user = {
    sub: 'user-1',
    organizationId: 'org-1',
    permissions: [],
    permissionVersion: 1,
    email: 'a@b.com',
  };

  beforeEach(() => {
    inventoryService = {
      search: jest.fn(),
      getHistory: jest.fn(),
      getByProduct: jest.fn(),
    };
    controller = new InventoryController(
      inventoryService as unknown as InventoryService,
    );
  });

  describe('permission metadata (Prompt 022)', () => {
    it.each([
      ['search', 'inventory:view'],
      ['getHistory', 'inventory:view'],
      ['getByProduct', 'inventory:view'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('search chỉ truyền query và organizationId', async () => {
    inventoryService.search.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { warehouseId: 'wh-1' } as never;
    await controller.search(query, user as never);
    expect(inventoryService.search).toHaveBeenCalledWith(query, 'org-1');
  });

  it('getHistory chỉ truyền query và organizationId', async () => {
    inventoryService.getHistory.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { movementType: 'SALE' } as never;
    await controller.getHistory(query, user as never);
    expect(inventoryService.getHistory).toHaveBeenCalledWith(query, 'org-1');
  });

  it('getByProduct ủy quyền cho service.getByProduct kèm organizationId', async () => {
    inventoryService.getByProduct.mockResolvedValue([]);
    await controller.getByProduct('product-1', user as never);
    expect(inventoryService.getByProduct).toHaveBeenCalledWith(
      'product-1',
      'org-1',
    );
  });
});
