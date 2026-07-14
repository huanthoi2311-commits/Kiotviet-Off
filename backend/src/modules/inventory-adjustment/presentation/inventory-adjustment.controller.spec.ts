import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import {
  ActorContext,
  InventoryAdjustmentService,
} from '../application/inventory-adjustment.service';
import { InventoryAdjustmentController } from './inventory-adjustment.controller';

describe('InventoryAdjustmentController', () => {
  let controller: InventoryAdjustmentController;
  let adjustmentService: jest.Mocked<
    Pick<
      InventoryAdjustmentService,
      'create' | 'search' | 'findOne' | 'submit' | 'approve' | 'complete'
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
    adjustmentService = {
      create: jest.fn(),
      search: jest.fn(),
      findOne: jest.fn(),
      submit: jest.fn(),
      approve: jest.fn(),
      complete: jest.fn(),
    };
    controller = new InventoryAdjustmentController(
      adjustmentService as unknown as InventoryAdjustmentService,
    );
  });

  describe('permission metadata (Prompt 025)', () => {
    it.each([
      ['create', 'inventory:adjust'],
      ['search', 'inventory:view'],
      ['findOne', 'inventory:view'],
      ['submit', 'inventory:adjust'],
      ['approve', 'inventory:approve'],
      ['complete', 'inventory:complete'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('create ủy quyền cho service kèm actor context', async () => {
    adjustmentService.create.mockResolvedValue({ id: 'adj-1' } as never);
    const dto = {
      warehouseId: 'wh-1',
      reason: 'LOST',
      items: [{ productId: 'product-1', quantity: -5 }],
    } as never;
    await controller.create(dto, user as never, req);

    const actor: ActorContext = adjustmentService.create.mock.calls[0][1];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('search chỉ truyền query và organizationId', async () => {
    adjustmentService.search.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { reason: 'LOST' } as never;
    await controller.search(query, user as never);
    expect(adjustmentService.search).toHaveBeenCalledWith(query, 'org-1');
  });

  it('findOne ủy quyền cho service.findOne kèm organizationId', async () => {
    adjustmentService.findOne.mockResolvedValue({ id: 'adj-1' } as never);
    const result = await controller.findOne('adj-1', user as never);
    expect(adjustmentService.findOne).toHaveBeenCalledWith('adj-1', 'org-1');
    expect(result).toEqual({ id: 'adj-1' });
  });

  it('submit ủy quyền cho service.submit kèm actor context', async () => {
    adjustmentService.submit.mockResolvedValue({
      id: 'adj-1',
      status: 'SUBMITTED',
    } as never);
    const result = await controller.submit('adj-1', user as never, req);
    expect(adjustmentService.submit).toHaveBeenCalledWith(
      'adj-1',
      expect.any(Object),
    );
    expect(result).toEqual({ id: 'adj-1', status: 'SUBMITTED' });
  });

  it('approve ủy quyền cho service.approve kèm actor context', async () => {
    adjustmentService.approve.mockResolvedValue({
      id: 'adj-1',
      status: 'APPROVED',
    } as never);
    await controller.approve('adj-1', user as never, req);
    expect(adjustmentService.approve).toHaveBeenCalledWith(
      'adj-1',
      expect.any(Object),
    );
  });

  it('complete ủy quyền cho service.complete kèm actor context', async () => {
    adjustmentService.complete.mockResolvedValue({
      id: 'adj-1',
      status: 'COMPLETED',
    } as never);
    await controller.complete('adj-1', user as never, req);
    expect(adjustmentService.complete).toHaveBeenCalledWith(
      'adj-1',
      expect.any(Object),
    );
  });
});
