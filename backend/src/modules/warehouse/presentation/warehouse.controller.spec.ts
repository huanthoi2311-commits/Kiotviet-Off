import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import {
  ActorContext,
  WarehouseService,
} from '../application/warehouse.service';
import { WarehouseController } from './warehouse.controller';

describe('WarehouseController', () => {
  let controller: WarehouseController;
  let warehouseService: jest.Mocked<
    Pick<
      WarehouseService,
      'create' | 'search' | 'findOne' | 'update' | 'remove' | 'restore'
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
    warehouseService = {
      create: jest.fn(),
      search: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      restore: jest.fn(),
    };
    controller = new WarehouseController(
      warehouseService as unknown as WarehouseService,
    );
  });

  describe('permission metadata (Prompt 021)', () => {
    it.each([
      ['create', 'warehouse:create'],
      ['search', 'warehouse:view'],
      ['findOne', 'warehouse:view'],
      ['update', 'warehouse:update'],
      ['remove', 'warehouse:delete'],
      ['restore', 'warehouse:restore'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('create ủy quyền cho service kèm actor context', async () => {
    warehouseService.create.mockResolvedValue({ id: 'wh-1' } as never);
    await controller.create(
      { branchId: 'branch-1', code: 'KHO-01', name: 'Kho Chính' },
      user as never,
      req,
    );

    const actor: ActorContext = warehouseService.create.mock.calls[0][1];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('search chỉ truyền query và organizationId', async () => {
    warehouseService.search.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { search: 'kho' } as never;
    await controller.search(query, user as never);
    expect(warehouseService.search).toHaveBeenCalledWith(query, 'org-1');
  });

  it('findOne ủy quyền cho service.findOne kèm organizationId', async () => {
    warehouseService.findOne.mockResolvedValue({ id: 'wh-1' } as never);
    const result = await controller.findOne('wh-1', user as never);
    expect(warehouseService.findOne).toHaveBeenCalledWith('wh-1', 'org-1');
    expect(result).toEqual({ id: 'wh-1' });
  });

  it('update ủy quyền cho service.update kèm actor context', async () => {
    warehouseService.update.mockResolvedValue({
      id: 'wh-1',
      name: 'x',
    } as never);
    const dto = { name: 'x' } as never;
    await controller.update('wh-1', dto, user as never, req);
    expect(warehouseService.update).toHaveBeenCalledWith(
      'wh-1',
      dto,
      expect.any(Object),
    );
  });

  it('remove gọi service.remove, không trả nội dung', async () => {
    warehouseService.remove.mockResolvedValue(undefined);
    await expect(
      controller.remove('wh-1', user as never, req),
    ).resolves.toBeUndefined();
    expect(warehouseService.remove).toHaveBeenCalledWith(
      'wh-1',
      expect.any(Object),
    );
  });

  it('restore ủy quyền cho service.restore', async () => {
    warehouseService.restore.mockResolvedValue({
      id: 'wh-1',
      deletedAt: null,
    } as never);
    const result = await controller.restore('wh-1', user as never, req);
    expect(result).toEqual({ id: 'wh-1', deletedAt: null });
  });
});
