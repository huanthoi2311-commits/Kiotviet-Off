import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import {
  ActorContext,
  PurchaseOrderService,
} from '../application/purchase-order.service';
import { PurchaseOrderController } from './purchase-order.controller';

describe('PurchaseOrderController', () => {
  let controller: PurchaseOrderController;
  let purchaseOrderService: jest.Mocked<
    Pick<
      PurchaseOrderService,
      'create' | 'search' | 'findOne' | 'approve' | 'receive' | 'cancel'
    >
  >;
  const reflector = new Reflector();

  const user = {
    sub: 'user-1',
    organizationId: 'org-1',
    permissions: [],
    permissionVersion: 1,
    email: 'a@b.com',
  };
  const req = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest' },
  } as unknown as Request;

  beforeEach(() => {
    purchaseOrderService = {
      create: jest.fn(),
      search: jest.fn(),
      findOne: jest.fn(),
      approve: jest.fn(),
      receive: jest.fn(),
      cancel: jest.fn(),
    };
    controller = new PurchaseOrderController(
      purchaseOrderService as unknown as PurchaseOrderService,
    );
  });

  describe('permission metadata (Prompt 027)', () => {
    it.each([
      ['create', 'purchase:create'],
      ['search', 'purchase:view'],
      ['findOne', 'purchase:view'],
      ['approve', 'purchase:approve'],
      ['receive', 'purchase:receive'],
      ['cancel', 'purchase:cancel'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('create ủy quyền cho service kèm actor context', async () => {
    purchaseOrderService.create.mockResolvedValue({ id: 'po-1' } as never);
    const dto = {
      branchId: 'branch-1',
      supplierId: 'supplier-1',
      items: [
        {
          productId: 'product-1',
          warehouseId: 'wh-1',
          quantity: 10,
          unitCost: 1000,
        },
      ],
    } as never;
    await controller.create(dto, user as never, req);

    const actor: ActorContext = purchaseOrderService.create.mock.calls[0][1];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('search chỉ truyền query và organizationId', async () => {
    purchaseOrderService.search.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { supplierId: 'supplier-1' } as never;
    await controller.search(query, user as never);
    expect(purchaseOrderService.search).toHaveBeenCalledWith(query, 'org-1');
  });

  it('findOne ủy quyền cho service.findOne kèm organizationId', async () => {
    purchaseOrderService.findOne.mockResolvedValue({ id: 'po-1' } as never);
    const result = await controller.findOne('po-1', user as never);
    expect(purchaseOrderService.findOne).toHaveBeenCalledWith('po-1', 'org-1');
    expect(result).toEqual({ id: 'po-1' });
  });

  it('approve ủy quyền cho service.approve kèm actor context', async () => {
    purchaseOrderService.approve.mockResolvedValue({
      id: 'po-1',
      status: 'APPROVED',
    } as never);
    await controller.approve('po-1', user as never, req);
    expect(purchaseOrderService.approve).toHaveBeenCalledWith(
      'po-1',
      expect.any(Object),
    );
  });

  it('receive ủy quyền cho service.receive kèm actor context', async () => {
    purchaseOrderService.receive.mockResolvedValue({
      id: 'po-1',
      status: 'RECEIVED',
    } as never);
    await controller.receive('po-1', user as never, req);
    expect(purchaseOrderService.receive).toHaveBeenCalledWith(
      'po-1',
      expect.any(Object),
    );
  });

  it('cancel ủy quyền cho service.cancel kèm actor context', async () => {
    purchaseOrderService.cancel.mockResolvedValue({
      id: 'po-1',
      status: 'CANCELLED',
    } as never);
    await controller.cancel('po-1', user as never, req);
    expect(purchaseOrderService.cancel).toHaveBeenCalledWith(
      'po-1',
      expect.any(Object),
    );
  });
});
