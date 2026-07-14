import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import {
  ActorContext,
  StockCountService,
} from '../application/stock-count.service';
import { StockCountController } from './stock-count.controller';

describe('StockCountController', () => {
  let controller: StockCountController;
  let stockCountService: jest.Mocked<
    Pick<
      StockCountService,
      'create' | 'search' | 'findOne' | 'start' | 'complete'
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
    stockCountService = {
      create: jest.fn(),
      search: jest.fn(),
      findOne: jest.fn(),
      start: jest.fn(),
      complete: jest.fn(),
    };
    controller = new StockCountController(
      stockCountService as unknown as StockCountService,
    );
  });

  describe('permission metadata (Prompt 024)', () => {
    it.each([
      ['create', 'stock_count:create'],
      ['search', 'stock_count:view'],
      ['findOne', 'stock_count:view'],
      ['start', 'stock_count:start'],
      ['complete', 'stock_count:complete'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('create ủy quyền cho service kèm actor context', async () => {
    stockCountService.create.mockResolvedValue({ id: 'sc-1' } as never);
    const dto = { warehouseId: 'wh-1', productIds: ['product-1'] } as never;
    await controller.create(dto, user as never, req);

    const actor: ActorContext = stockCountService.create.mock.calls[0][1];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('search chỉ truyền query và organizationId', async () => {
    stockCountService.search.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { status: 'DRAFT' } as never;
    await controller.search(query, user as never);
    expect(stockCountService.search).toHaveBeenCalledWith(query, 'org-1');
  });

  it('findOne ủy quyền cho service.findOne kèm organizationId', async () => {
    stockCountService.findOne.mockResolvedValue({ id: 'sc-1' } as never);
    const result = await controller.findOne('sc-1', user as never);
    expect(stockCountService.findOne).toHaveBeenCalledWith('sc-1', 'org-1');
    expect(result).toEqual({ id: 'sc-1' });
  });

  it('start ủy quyền cho service.start kèm actor context', async () => {
    stockCountService.start.mockResolvedValue({
      id: 'sc-1',
      status: 'COUNTING',
    } as never);
    const result = await controller.start('sc-1', user as never, req);
    expect(stockCountService.start).toHaveBeenCalledWith(
      'sc-1',
      expect.any(Object),
    );
    expect(result).toEqual({ id: 'sc-1', status: 'COUNTING' });
  });

  it('complete ủy quyền cho service.complete kèm actor context', async () => {
    stockCountService.complete.mockResolvedValue({
      id: 'sc-1',
      status: 'COMPLETED',
    } as never);
    const dto = { items: [{ itemId: 'item-1', actualQty: 95 }] } as never;
    await controller.complete('sc-1', dto, user as never, req);
    expect(stockCountService.complete).toHaveBeenCalledWith(
      'sc-1',
      dto,
      expect.any(Object),
    );
  });
});
