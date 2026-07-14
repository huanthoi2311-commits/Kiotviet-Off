import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { ActorContext, UnitService } from '../application/unit.service';
import { UnitController } from './unit.controller';

describe('UnitController', () => {
  let controller: UnitController;
  let unitService: jest.Mocked<
    Pick<UnitService, 'create' | 'search' | 'findOne' | 'update' | 'remove'>
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
    unitService = {
      create: jest.fn(),
      search: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    controller = new UnitController(unitService as unknown as UnitService);
  });

  describe('permission metadata (Prompt 019)', () => {
    it.each([
      ['create', 'unit:create'],
      ['search', 'unit:view'],
      ['findOne', 'unit:view'],
      ['update', 'unit:update'],
      ['remove', 'unit:delete'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('create ủy quyền cho service kèm actor context', async () => {
    unitService.create.mockResolvedValue({ id: 'unit-1' } as never);
    await controller.create(
      { code: 'CAI', name: 'Cái', symbol: 'cái' },
      user as never,
      req,
    );

    const actor: ActorContext = unitService.create.mock.calls[0][1];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('search chỉ truyền query và organizationId', async () => {
    unitService.search.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { search: 'cai' } as never;
    await controller.search(query, user as never);
    expect(unitService.search).toHaveBeenCalledWith(query, 'org-1');
  });

  it('findOne ủy quyền cho service.findOne kèm organizationId', async () => {
    unitService.findOne.mockResolvedValue({ id: 'unit-1' } as never);
    const result = await controller.findOne('unit-1', user as never);
    expect(unitService.findOne).toHaveBeenCalledWith('unit-1', 'org-1');
    expect(result).toEqual({ id: 'unit-1' });
  });

  it('update ủy quyền cho service.update kèm actor context', async () => {
    unitService.update.mockResolvedValue({ id: 'unit-1', name: 'x' } as never);
    const dto = { name: 'x' } as never;
    await controller.update('unit-1', dto, user as never, req);
    expect(unitService.update).toHaveBeenCalledWith(
      'unit-1',
      dto,
      expect.any(Object),
    );
  });

  it('remove gọi service.remove, không trả nội dung', async () => {
    unitService.remove.mockResolvedValue(undefined);
    await expect(
      controller.remove('unit-1', user as never, req),
    ).resolves.toBeUndefined();
    expect(unitService.remove).toHaveBeenCalledWith(
      'unit-1',
      expect.any(Object),
    );
  });
});
