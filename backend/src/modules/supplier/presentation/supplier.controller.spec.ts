import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { SupplierExcelService } from '../application/supplier-excel.service';
import { ActorContext, SupplierService } from '../application/supplier.service';
import { SupplierController } from './supplier.controller';

describe('SupplierController', () => {
  let controller: SupplierController;
  let supplierService: jest.Mocked<
    Pick<
      SupplierService,
      'create' | 'search' | 'findOne' | 'update' | 'remove' | 'restore'
    >
  >;
  let supplierExcelService: jest.Mocked<
    Pick<SupplierExcelService, 'importFromExcel' | 'exportToExcel'>
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
    supplierService = {
      create: jest.fn(),
      search: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      restore: jest.fn(),
    };
    supplierExcelService = {
      importFromExcel: jest.fn(),
      exportToExcel: jest.fn(),
    };
    controller = new SupplierController(
      supplierService as unknown as SupplierService,
      supplierExcelService as unknown as SupplierExcelService,
    );
  });

  describe('permission metadata (Prompt 026)', () => {
    it.each([
      ['create', 'supplier:create'],
      ['import', 'supplier:import'],
      ['export', 'supplier:export'],
      ['search', 'supplier:view'],
      ['findOne', 'supplier:view'],
      ['update', 'supplier:update'],
      ['remove', 'supplier:delete'],
      ['restore', 'supplier:restore'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('create ủy quyền cho service kèm actor context', async () => {
    supplierService.create.mockResolvedValue({ id: 'sup-1' } as never);
    const dto = { code: 'NCC001', companyName: 'A' } as never;
    await controller.create(dto, user as never, req);

    const actor: ActorContext = supplierService.create.mock.calls[0][1];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  describe('import', () => {
    it('ném BadRequestException khi không có file', async () => {
      await expect(
        controller.import(undefined as never, user as never, req),
      ).rejects.toThrow(BadRequestException);
      expect(supplierExcelService.importFromExcel).not.toHaveBeenCalled();
    });

    it('ủy quyền cho service khi có file', async () => {
      supplierExcelService.importFromExcel.mockResolvedValue({
        createdCount: 1,
        updatedCount: 0,
      });
      const file = { buffer: Buffer.from('x') } as Express.Multer.File;
      const result = await controller.import(file, user as never, req);
      expect(result).toEqual({ createdCount: 1, updatedCount: 0 });
      expect(supplierExcelService.importFromExcel).toHaveBeenCalledWith(
        file.buffer,
        expect.any(Object),
      );
    });
  });

  describe('export', () => {
    it('gửi buffer qua res.send()', async () => {
      const buffer = Buffer.from('fake-xlsx');
      supplierExcelService.exportToExcel.mockResolvedValue(buffer);
      const send = jest.fn();
      const res = { send } as unknown as Response;

      await controller.export({}, user as never, req, res);

      expect(supplierExcelService.exportToExcel).toHaveBeenCalledWith(
        {},
        expect.any(Object),
      );
      expect(send).toHaveBeenCalledWith(buffer);
    });
  });

  it('search chỉ truyền query và organizationId', async () => {
    supplierService.search.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { search: 'A' } as never;
    await controller.search(query, user as never);
    expect(supplierService.search).toHaveBeenCalledWith(query, 'org-1');
  });

  it('findOne ủy quyền cho service.findOne kèm organizationId', async () => {
    supplierService.findOne.mockResolvedValue({ id: 'sup-1' } as never);
    const result = await controller.findOne('sup-1', user as never);
    expect(supplierService.findOne).toHaveBeenCalledWith('sup-1', 'org-1');
    expect(result).toEqual({ id: 'sup-1' });
  });

  it('update ủy quyền cho service.update kèm actor context', async () => {
    supplierService.update.mockResolvedValue({
      id: 'sup-1',
      companyName: 'x',
    } as never);
    const dto = { companyName: 'x' } as never;
    await controller.update('sup-1', dto, user as never, req);
    expect(supplierService.update).toHaveBeenCalledWith(
      'sup-1',
      dto,
      expect.any(Object),
    );
  });

  it('remove gọi service.remove, không trả nội dung', async () => {
    supplierService.remove.mockResolvedValue(undefined);
    await expect(
      controller.remove('sup-1', user as never, req),
    ).resolves.toBeUndefined();
    expect(supplierService.remove).toHaveBeenCalledWith(
      'sup-1',
      expect.any(Object),
    );
  });

  it('restore ủy quyền cho service.restore', async () => {
    supplierService.restore.mockResolvedValue({
      id: 'sup-1',
      deletedAt: null,
    } as never);
    const result = await controller.restore('sup-1', user as never, req);
    expect(result).toEqual({ id: 'sup-1', deletedAt: null });
  });
});
