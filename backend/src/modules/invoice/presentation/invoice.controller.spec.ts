import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { InvoiceService } from '../application/invoice.service';
import { InvoiceController } from './invoice.controller';

describe('InvoiceController', () => {
  let controller: InvoiceController;
  let invoiceService: jest.Mocked<Pick<InvoiceService, 'getById' | 'search'>>;
  const reflector = new Reflector();

  const user = {
    sub: 'user-1',
    organizationId: 'org-1',
    permissions: [],
    permissionVersion: 1,
    email: 'a@b.com',
  };

  beforeEach(() => {
    invoiceService = {
      getById: jest.fn(),
      search: jest.fn(),
    };
    controller = new InvoiceController(
      invoiceService as unknown as InvoiceService,
    );
  });

  it('yêu cầu quyền invoice:view ở cấp Controller', () => {
    const permissions = reflector.get<string[]>(
      PERMISSIONS_KEY,
      InvoiceController,
    );
    expect(permissions).toEqual(['invoice:view']);
  });

  it('getById ủy quyền cho service kèm organizationId', async () => {
    invoiceService.getById.mockResolvedValue({ id: 'inv-1' } as never);
    await controller.getById('inv-1', user as never);
    expect(invoiceService.getById).toHaveBeenCalledWith('inv-1', 'org-1');
  });

  it('search ủy quyền cho service kèm query + organizationId', async () => {
    invoiceService.search.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { page: 1, limit: 20 } as never;
    await controller.search(query, user as never);
    expect(invoiceService.search).toHaveBeenCalledWith(query, 'org-1');
  });
});
