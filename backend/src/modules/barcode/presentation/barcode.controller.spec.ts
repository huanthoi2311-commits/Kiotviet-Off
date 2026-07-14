import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { BarcodeService } from '../application/barcode.service';
import { BarcodeController } from './barcode.controller';

describe('BarcodeController', () => {
  let controller: BarcodeController;
  let barcodeService: jest.Mocked<
    Pick<BarcodeService, 'update' | 'remove' | 'setDefault'>
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
    barcodeService = {
      update: jest.fn(),
      remove: jest.fn(),
      setDefault: jest.fn(),
    };
    controller = new BarcodeController(
      barcodeService as unknown as BarcodeService,
    );
  });

  describe('permission metadata (Prompt 020)', () => {
    it.each([
      ['update', 'barcode:update'],
      ['remove', 'barcode:delete'],
      ['setDefault', 'barcode:update'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('update ủy quyền cho service.update kèm actor context', async () => {
    barcodeService.update.mockResolvedValue({
      id: 'barcode-1',
      code: 'x',
    } as never);
    const dto = { code: 'x' } as never;
    await controller.update('barcode-1', dto, user as never, req);
    expect(barcodeService.update).toHaveBeenCalledWith(
      'barcode-1',
      dto,
      expect.any(Object),
    );
  });

  it('remove gọi service.remove, không trả nội dung', async () => {
    barcodeService.remove.mockResolvedValue(undefined);
    await expect(
      controller.remove('barcode-1', user as never, req),
    ).resolves.toBeUndefined();
    expect(barcodeService.remove).toHaveBeenCalledWith(
      'barcode-1',
      expect.any(Object),
    );
  });

  it('setDefault ủy quyền cho service.setDefault kèm actor context', async () => {
    barcodeService.setDefault.mockResolvedValue({
      id: 'barcode-1',
      isDefault: true,
    } as never);
    const result = await controller.setDefault('barcode-1', user as never, req);
    expect(barcodeService.setDefault).toHaveBeenCalledWith(
      'barcode-1',
      expect.any(Object),
    );
    expect(result).toEqual({ id: 'barcode-1', isDefault: true });
  });
});
