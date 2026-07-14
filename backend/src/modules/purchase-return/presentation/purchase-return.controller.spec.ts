import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import {
  ActorContext,
  PurchaseReturnService,
} from '../application/purchase-return.service';
import { PurchaseReturnController } from './purchase-return.controller';

describe('PurchaseReturnController', () => {
  let controller: PurchaseReturnController;
  let purchaseReturnService: jest.Mocked<
    Pick<
      PurchaseReturnService,
      'create' | 'search' | 'findOne' | 'approve' | 'complete' | 'cancel'
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
    purchaseReturnService = {
      create: jest.fn(),
      search: jest.fn(),
      findOne: jest.fn(),
      approve: jest.fn(),
      complete: jest.fn(),
      cancel: jest.fn(),
    };
    controller = new PurchaseReturnController(
      purchaseReturnService as unknown as PurchaseReturnService,
    );
  });

  describe('permission metadata (Prompt 028)', () => {
    it.each([
      ['create', 'purchase_return:create'],
      ['search', 'purchase_return:view'],
      ['findOne', 'purchase_return:view'],
      ['approve', 'purchase_return:approve'],
      ['complete', 'purchase_return:complete'],
      ['cancel', 'purchase_return:cancel'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('create ủy quyền cho service kèm actor context', async () => {
    purchaseReturnService.create.mockResolvedValue({ id: 'pr-1' } as never);
    const dto = {
      purchaseOrderId: 'po-1',
      reason: 'DAMAGED',
      items: [{ purchaseItemId: 'item-1', quantity: 5 }],
    } as never;
    await controller.create(dto, user as never, req);

    const actor: ActorContext = purchaseReturnService.create.mock.calls[0][1];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('search chỉ truyền query và organizationId', async () => {
    purchaseReturnService.search.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { supplierId: 'supplier-1' } as never;
    await controller.search(query, user as never);
    expect(purchaseReturnService.search).toHaveBeenCalledWith(query, 'org-1');
  });

  it('findOne ủy quyền cho service.findOne kèm organizationId', async () => {
    purchaseReturnService.findOne.mockResolvedValue({ id: 'pr-1' } as never);
    const result = await controller.findOne('pr-1', user as never);
    expect(purchaseReturnService.findOne).toHaveBeenCalledWith('pr-1', 'org-1');
    expect(result).toEqual({ id: 'pr-1' });
  });

  it('approve ủy quyền cho service.approve kèm actor context', async () => {
    purchaseReturnService.approve.mockResolvedValue({
      id: 'pr-1',
      status: 'APPROVED',
    } as never);
    await controller.approve('pr-1', user as never, req);
    expect(purchaseReturnService.approve).toHaveBeenCalledWith(
      'pr-1',
      expect.any(Object),
    );
  });

  it('complete ủy quyền cho service.complete kèm actor context', async () => {
    purchaseReturnService.complete.mockResolvedValue({
      id: 'pr-1',
      status: 'COMPLETED',
    } as never);
    await controller.complete('pr-1', user as never, req);
    expect(purchaseReturnService.complete).toHaveBeenCalledWith(
      'pr-1',
      expect.any(Object),
    );
  });

  it('cancel ủy quyền cho service.cancel kèm actor context', async () => {
    purchaseReturnService.cancel.mockResolvedValue({
      id: 'pr-1',
      status: 'CANCELLED',
    } as never);
    await controller.cancel('pr-1', user as never, req);
    expect(purchaseReturnService.cancel).toHaveBeenCalledWith(
      'pr-1',
      expect.any(Object),
    );
  });
});
