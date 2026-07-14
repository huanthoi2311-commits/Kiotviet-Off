import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { SupplierProductService } from '../application/supplier-product.service';
import { ActorContext } from '../application/supplier.service';
import { SupplierProductController } from './supplier-product.controller';

describe('SupplierProductController', () => {
  let controller: SupplierProductController;
  let supplierProductService: jest.Mocked<
    Pick<SupplierProductService, 'listBySupplier' | 'upsert' | 'remove'>
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
    supplierProductService = {
      listBySupplier: jest.fn(),
      upsert: jest.fn(),
      remove: jest.fn(),
    };
    controller = new SupplierProductController(
      supplierProductService as unknown as SupplierProductService,
    );
  });

  describe('permission metadata (Prompt 026)', () => {
    it.each([
      ['list', 'supplier:view'],
      ['upsert', 'supplier:update'],
      ['remove', 'supplier:update'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('list ủy quyền cho service.listBySupplier kèm organizationId', async () => {
    supplierProductService.listBySupplier.mockResolvedValue([]);
    await controller.list('sup-1', user as never);
    expect(supplierProductService.listBySupplier).toHaveBeenCalledWith(
      'sup-1',
      'org-1',
    );
  });

  it('upsert ủy quyền cho service kèm actor context', async () => {
    supplierProductService.upsert.mockResolvedValue({ id: 'sp-1' } as never);
    const dto = { productId: 'product-1' } as never;
    await controller.upsert('sup-1', dto, user as never, req);

    const actor: ActorContext = supplierProductService.upsert.mock.calls[0][2];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('remove gọi service.remove, không trả nội dung', async () => {
    supplierProductService.remove.mockResolvedValue(undefined);
    await expect(
      controller.remove('sup-1', 'product-1', user as never, req),
    ).resolves.toBeUndefined();
    expect(supplierProductService.remove).toHaveBeenCalledWith(
      'sup-1',
      'product-1',
      expect.any(Object),
    );
  });
});
