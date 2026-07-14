import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { SupplierDebtService } from '../application/supplier-debt.service';
import { SupplierDebtController } from './supplier-debt.controller';

describe('SupplierDebtController', () => {
  let controller: SupplierDebtController;
  let supplierDebtService: jest.Mocked<Pick<SupplierDebtService, 'search'>>;
  const reflector = new Reflector();

  const user = {
    sub: 'user-1',
    organizationId: 'org-1',
    permissions: [],
    permissionVersion: 1,
    email: 'a@b.com',
  };

  beforeEach(() => {
    supplierDebtService = { search: jest.fn() };
    controller = new SupplierDebtController(
      supplierDebtService as unknown as SupplierDebtService,
    );
  });

  it('search yêu cầu permission debt:view', () => {
    const permissions = reflector.get<string[]>(
      PERMISSIONS_KEY,
      controller.search,
    );
    expect(permissions).toEqual(['debt:view']);
  });

  it('search chỉ truyền query và organizationId', async () => {
    supplierDebtService.search.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { search: 'NCC' } as never;
    await controller.search(query, user as never);
    expect(supplierDebtService.search).toHaveBeenCalledWith(query, 'org-1');
  });
});
