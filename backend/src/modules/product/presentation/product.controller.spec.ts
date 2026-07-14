import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { ActorContext, ProductService } from '../application/product.service';
import { ProductController } from './product.controller';

describe('ProductController', () => {
  let controller: ProductController;
  let productService: jest.Mocked<
    Pick<
      ProductService,
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
    productService = {
      create: jest.fn(),
      search: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      restore: jest.fn(),
    };
    controller = new ProductController(
      productService as unknown as ProductService,
    );
  });

  describe('permission metadata (Prompt 016: product:create/view/update/delete/restore bắt buộc)', () => {
    it.each([
      ['create', 'product:create'],
      ['search', 'product:view'],
      ['findOne', 'product:view'],
      ['update', 'product:update'],
      ['remove', 'product:delete'],
      ['restore', 'product:restore'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('create ủy quyền cho ProductService kèm actor context từ request', async () => {
    productService.create.mockResolvedValue({ id: 'product-1' } as never);
    const dto = { name: 'x' } as never;

    await controller.create(dto, user as never, req);

    const actor: ActorContext = productService.create.mock.calls[0][1];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('search chỉ truyền organizationId, không lộ dữ liệu tổ chức khác', async () => {
    productService.search.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    await controller.search({}, user as never);
    expect(productService.search).toHaveBeenCalledWith({}, 'org-1');
  });

  it('remove gọi service.remove và không trả về nội dung (204)', async () => {
    productService.remove.mockResolvedValue(undefined);
    await expect(
      controller.remove('product-1', user as never, req),
    ).resolves.toBeUndefined();
    expect(productService.remove).toHaveBeenCalledWith(
      'product-1',
      expect.any(Object),
    );
  });

  it('findOne ủy quyền cho service.findOne kèm organizationId', async () => {
    productService.findOne.mockResolvedValue({ id: 'product-1' } as never);
    const result = await controller.findOne('product-1', user as never);
    expect(productService.findOne).toHaveBeenCalledWith('product-1', 'org-1');
    expect(result).toEqual({ id: 'product-1' });
  });

  it('update ủy quyền cho service.update kèm actor context', async () => {
    productService.update.mockResolvedValue({
      id: 'product-1',
      name: 'x',
    } as never);
    const dto = { name: 'x' } as never;

    await controller.update('product-1', dto, user as never, req);

    expect(productService.update).toHaveBeenCalledWith(
      'product-1',
      dto,
      expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
      }),
    );
  });

  it('restore ủy quyền cho service.restore kèm actor context', async () => {
    productService.restore.mockResolvedValue({
      id: 'product-1',
      deletedAt: null,
    } as never);

    const result = await controller.restore('product-1', user as never, req);

    expect(productService.restore).toHaveBeenCalledWith(
      'product-1',
      expect.any(Object),
    );
    expect(result).toEqual({ id: 'product-1', deletedAt: null });
  });
});
