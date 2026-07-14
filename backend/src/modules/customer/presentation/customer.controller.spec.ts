import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { ActorContext, CustomerService } from '../application/customer.service';
import { CustomerController } from './customer.controller';

describe('CustomerController', () => {
  let controller: CustomerController;
  let customerService: jest.Mocked<
    Pick<
      CustomerService,
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
    customerService = {
      create: jest.fn(),
      search: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      restore: jest.fn(),
    };
    controller = new CustomerController(
      customerService as unknown as CustomerService,
    );
  });

  describe('permission metadata (Prompt 031)', () => {
    it.each([
      ['create', 'customer:create'],
      ['search', 'customer:view'],
      ['findOne', 'customer:view'],
      ['update', 'customer:update'],
      ['remove', 'customer:delete'],
      ['restore', 'customer:restore'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('create ủy quyền cho service kèm actor context', async () => {
    customerService.create.mockResolvedValue({ id: 'cus-1' } as never);
    const dto = { fullName: 'Nguyễn Văn A', phone: '0987654321' } as never;
    await controller.create(dto, user as never, req);

    const actor: ActorContext = customerService.create.mock.calls[0][1];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('search chỉ truyền query và organizationId', async () => {
    customerService.search.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { search: 'Nguyễn' } as never;
    await controller.search(query, user as never);
    expect(customerService.search).toHaveBeenCalledWith(query, 'org-1');
  });

  it('findOne ủy quyền cho service.findOne kèm organizationId', async () => {
    customerService.findOne.mockResolvedValue({ id: 'cus-1' } as never);
    const result = await controller.findOne('cus-1', user as never);
    expect(customerService.findOne).toHaveBeenCalledWith('cus-1', 'org-1');
    expect(result).toEqual({ id: 'cus-1' });
  });

  it('update ủy quyền cho service.update kèm actor context', async () => {
    customerService.update.mockResolvedValue({
      id: 'cus-1',
      fullName: 'B',
    } as never);
    const dto = { fullName: 'B' } as never;
    await controller.update('cus-1', dto, user as never, req);
    expect(customerService.update).toHaveBeenCalledWith(
      'cus-1',
      dto,
      expect.any(Object),
    );
  });

  it('remove ủy quyền cho service.remove kèm actor context', async () => {
    await controller.remove('cus-1', user as never, req);
    expect(customerService.remove).toHaveBeenCalledWith(
      'cus-1',
      expect.any(Object),
    );
  });

  it('restore ủy quyền cho service.restore kèm actor context', async () => {
    customerService.restore.mockResolvedValue({ id: 'cus-1' } as never);
    await controller.restore('cus-1', user as never, req);
    expect(customerService.restore).toHaveBeenCalledWith(
      'cus-1',
      expect.any(Object),
    );
  });
});
