import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { BarcodeService } from '../application/barcode.service';
import { BarcodeController } from './barcode.controller';

describe('BarcodeController', () => {
  let controller: BarcodeController;
  let barcodeService: jest.Mocked<
    Pick<
      BarcodeService,
      'search' | 'update' | 'remove' | 'restore' | 'setDefault'
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
    barcodeService = {
      search: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      restore: jest.fn(),
      setDefault: jest.fn(),
    };
    controller = new BarcodeController(
      barcodeService as unknown as BarcodeService,
    );
  });

  describe('permission metadata (Prompt 020)', () => {
    it.each([
      ['search', 'barcode:view'],
      ['update', 'barcode:update'],
      ['remove', 'barcode:delete'],
      ['restore', 'barcode:restore'],
      ['setDefault', 'barcode:update'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('search ủy quyền cho service.search kèm organizationId', async () => {
    barcodeService.search.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { search: 'abc' } as never;
    await controller.search(query, user as never);
    expect(barcodeService.search).toHaveBeenCalledWith(query, 'org-1');
  });

  it('update ủy quyền cho service.update kèm actor context', async () => {
    barcodeService.update.mockResolvedValue({
      id: 'barcode-1',
      code: 'x',
    } as never);
    const dto = { version: 1, code: 'x' } as never;
    await controller.update('barcode-1', dto, user as never, req);
    expect(barcodeService.update).toHaveBeenCalledWith(
      'barcode-1',
      dto,
      expect.any(Object),
    );
  });

  it('remove gọi service.remove kèm version từ body, không trả nội dung', async () => {
    barcodeService.remove.mockResolvedValue(undefined);
    const dto = { version: 1 } as never;
    await expect(
      controller.remove('barcode-1', dto, user as never, req),
    ).resolves.toBeUndefined();
    expect(barcodeService.remove).toHaveBeenCalledWith(
      'barcode-1',
      1,
      expect.any(Object),
    );
  });

  it('restore ủy quyền cho service.restore kèm version từ body', async () => {
    barcodeService.restore.mockResolvedValue({
      id: 'barcode-1',
      status: 'INACTIVE',
    } as never);
    const dto = { version: 2 } as never;
    const result = await controller.restore(
      'barcode-1',
      dto,
      user as never,
      req,
    );
    expect(barcodeService.restore).toHaveBeenCalledWith(
      'barcode-1',
      2,
      expect.any(Object),
    );
    expect(result).toEqual({ id: 'barcode-1', status: 'INACTIVE' });
  });

  it('setDefault ủy quyền cho service.setDefault kèm version từ body', async () => {
    barcodeService.setDefault.mockResolvedValue({
      id: 'barcode-1',
      isDefault: true,
    } as never);
    const dto = { version: 1 } as never;
    const result = await controller.setDefault(
      'barcode-1',
      dto,
      user as never,
      req,
    );
    expect(barcodeService.setDefault).toHaveBeenCalledWith(
      'barcode-1',
      1,
      expect.any(Object),
    );
    expect(result).toEqual({ id: 'barcode-1', isDefault: true });
  });
});
