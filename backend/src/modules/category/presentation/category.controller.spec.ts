import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { ActorContext, CategoryService } from '../application/category.service';
import { CategoryController } from './category.controller';

describe('CategoryController', () => {
  let controller: CategoryController;
  let categoryService: jest.Mocked<
    Pick<
      CategoryService,
      | 'create'
      | 'list'
      | 'getTree'
      | 'findOne'
      | 'update'
      | 'remove'
      | 'restore'
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
    categoryService = {
      create: jest.fn(),
      list: jest.fn(),
      getTree: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      restore: jest.fn(),
    };
    controller = new CategoryController(
      categoryService as unknown as CategoryService,
    );
  });

  describe('permission metadata (Prompt 017)', () => {
    it.each([
      ['create', 'category:create'],
      ['list', 'category:view'],
      ['getTree', 'category:view'],
      ['findOne', 'category:view'],
      ['update', 'category:update'],
      ['remove', 'category:delete'],
      ['restore', 'category:restore'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('create ủy quyền cho service kèm actor context', async () => {
    categoryService.create.mockResolvedValue({ id: 'cat-1' } as never);
    await controller.create({ code: 'x', name: 'x' }, user as never, req);

    const actor: ActorContext = categoryService.create.mock.calls[0][1];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('getTree chỉ truyền organizationId', async () => {
    categoryService.getTree.mockResolvedValue([]);
    await controller.getTree(user as never);
    expect(categoryService.getTree).toHaveBeenCalledWith('org-1');
  });

  it('list chỉ truyền organizationId', async () => {
    categoryService.list.mockResolvedValue([]);
    await controller.list(user as never);
    expect(categoryService.list).toHaveBeenCalledWith('org-1');
  });

  it('findOne ủy quyền cho service.findOne kèm organizationId', async () => {
    categoryService.findOne.mockResolvedValue({ id: 'cat-1' } as never);
    const result = await controller.findOne('cat-1', user as never);
    expect(categoryService.findOne).toHaveBeenCalledWith('cat-1', 'org-1');
    expect(result).toEqual({ id: 'cat-1' });
  });

  it('update ủy quyền cho service.update kèm actor context', async () => {
    categoryService.update.mockResolvedValue({
      id: 'cat-1',
      name: 'x',
    } as never);
    const dto = { name: 'x' } as never;
    await controller.update('cat-1', dto, user as never, req);
    expect(categoryService.update).toHaveBeenCalledWith(
      'cat-1',
      dto,
      expect.any(Object),
    );
  });

  it('remove gọi service.remove, không trả nội dung', async () => {
    categoryService.remove.mockResolvedValue(undefined);
    await expect(
      controller.remove('cat-1', user as never, req),
    ).resolves.toBeUndefined();
    expect(categoryService.remove).toHaveBeenCalledWith(
      'cat-1',
      expect.any(Object),
    );
  });

  it('restore ủy quyền cho service.restore', async () => {
    categoryService.restore.mockResolvedValue({
      id: 'cat-1',
      deletedAt: null,
    } as never);
    const result = await controller.restore('cat-1', user as never, req);
    expect(result).toEqual({ id: 'cat-1', deletedAt: null });
  });
});
