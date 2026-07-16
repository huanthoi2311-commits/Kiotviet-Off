import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { ActorContext, BrandService } from '../application/brand.service';
import { BrandController } from './brand.controller';

describe('BrandController', () => {
  let controller: BrandController;
  let brandService: jest.Mocked<
    Pick<
      BrandService,
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
    brandService = {
      create: jest.fn(),
      search: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      restore: jest.fn(),
    };
    controller = new BrandController(brandService as unknown as BrandService);
  });

  describe('permission metadata (Prompt 018)', () => {
    it.each([
      ['create', 'brand:create'],
      ['search', 'brand:view'],
      ['findOne', 'brand:view'],
      ['update', 'brand:update'],
      ['remove', 'brand:delete'],
      ['restore', 'brand:restore'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('create ủy quyền cho service kèm actor context', async () => {
    brandService.create.mockResolvedValue({ id: 'brand-1' } as never);
    await controller.create({ code: 'NIKE', name: 'Nike' }, user as never, req);

    const actor: ActorContext = brandService.create.mock.calls[0][1];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('search chỉ truyền query và organizationId', async () => {
    brandService.search.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { search: 'nike' } as never;
    await controller.search(query, user as never);
    expect(brandService.search).toHaveBeenCalledWith(query, 'org-1');
  });

  it('findOne ủy quyền cho service.findOne kèm organizationId', async () => {
    brandService.findOne.mockResolvedValue({ id: 'brand-1' } as never);
    const result = await controller.findOne('brand-1', user as never);
    expect(brandService.findOne).toHaveBeenCalledWith('brand-1', 'org-1');
    expect(result).toEqual({ id: 'brand-1' });
  });

  it('update ủy quyền cho service.update kèm actor context', async () => {
    brandService.update.mockResolvedValue({
      id: 'brand-1',
      name: 'x',
    } as never);
    const dto = { name: 'x' } as never;
    await controller.update('brand-1', dto, user as never, req);
    expect(brandService.update).toHaveBeenCalledWith(
      'brand-1',
      dto,
      expect.any(Object),
    );
  });

  it('remove gọi service.remove, không trả nội dung', async () => {
    brandService.remove.mockResolvedValue(undefined);
    await expect(
      controller.remove('brand-1', user as never, req),
    ).resolves.toBeUndefined();
    expect(brandService.remove).toHaveBeenCalledWith(
      'brand-1',
      expect.any(Object),
    );
  });

  it('restore ủy quyền cho service.restore kèm actor context', async () => {
    brandService.restore.mockResolvedValue({
      id: 'brand-1',
      status: 'INACTIVE',
    } as never);
    const result = await controller.restore('brand-1', user as never, req);
    expect(brandService.restore).toHaveBeenCalledWith(
      'brand-1',
      expect.any(Object),
    );
    expect(result).toEqual({ id: 'brand-1', status: 'INACTIVE' });
  });
});
