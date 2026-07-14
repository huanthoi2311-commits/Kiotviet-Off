import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { ActorContext, BarcodeService } from '../application/barcode.service';
import { ProductBarcodeController } from './product-barcode.controller';

describe('ProductBarcodeController', () => {
  let controller: ProductBarcodeController;
  let barcodeService: jest.Mocked<
    Pick<BarcodeService, 'listByProduct' | 'create'>
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
    barcodeService = { listByProduct: jest.fn(), create: jest.fn() };
    controller = new ProductBarcodeController(
      barcodeService as unknown as BarcodeService,
    );
  });

  describe('permission metadata (Prompt 020)', () => {
    it.each([
      ['list', 'barcode:view'],
      ['create', 'barcode:create'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('list ủy quyền cho service.listByProduct kèm organizationId', async () => {
    barcodeService.listByProduct.mockResolvedValue([]);
    await controller.list('product-1', user as never);
    expect(barcodeService.listByProduct).toHaveBeenCalledWith(
      'product-1',
      'org-1',
    );
  });

  it('create ủy quyền cho service kèm actor context', async () => {
    barcodeService.create.mockResolvedValue({ id: 'barcode-1' } as never);
    await controller.create(
      'product-1',
      { code: 'X', type: 'CUSTOM' } as never,
      user as never,
      req,
    );

    const actor: ActorContext = barcodeService.create.mock.calls[0][2];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });
});
