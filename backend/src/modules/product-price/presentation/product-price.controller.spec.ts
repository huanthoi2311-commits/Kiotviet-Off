import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import {
  ActorContext,
  ProductPriceService,
} from '../application/product-price.service';
import { ProductPriceController } from './product-price.controller';

describe('ProductPriceController', () => {
  let controller: ProductPriceController;
  let productPriceService: jest.Mocked<
    Pick<ProductPriceService, 'findSet' | 'replaceSet'>
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
    productPriceService = { findSet: jest.fn(), replaceSet: jest.fn() };
    controller = new ProductPriceController(
      productPriceService as unknown as ProductPriceService,
    );
  });

  describe('permission metadata', () => {
    it.each([
      ['findSet', 'product:view'],
      ['replaceSet', 'product:update'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('findSet ủy quyền cho service.findSet kèm organizationId', async () => {
    productPriceService.findSet.mockResolvedValue({
      productId: 'product-1',
      priceVersion: 1,
      prices: [],
    });
    await controller.findSet('product-1', user as never);
    expect(productPriceService.findSet).toHaveBeenCalledWith(
      'product-1',
      'org-1',
    );
  });

  it('replaceSet ủy quyền cho service.replaceSet kèm actor context', async () => {
    productPriceService.replaceSet.mockResolvedValue({
      productId: 'product-1',
      priceVersion: 2,
      prices: [],
    });
    const dto = { priceVersion: 1, prices: [{ type: 'RETAIL', price: 100 }] };
    await controller.replaceSet('product-1', dto as never, user as never, req);

    expect(productPriceService.replaceSet).toHaveBeenCalledWith(
      'product-1',
      dto,
      expect.any(Object),
    );
    const actor: ActorContext = productPriceService.replaceSet.mock.calls[0][2];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });
});
