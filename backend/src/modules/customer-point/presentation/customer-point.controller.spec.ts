import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import {
  ActorContext,
  CustomerPointService,
} from '../application/customer-point.service';
import { CustomerPointController } from './customer-point.controller';

describe('CustomerPointController', () => {
  let controller: CustomerPointController;
  let customerPointService: jest.Mocked<
    Pick<CustomerPointService, 'addPoint' | 'usePoint' | 'getHistory'>
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
    customerPointService = {
      addPoint: jest.fn(),
      usePoint: jest.fn(),
      getHistory: jest.fn(),
    };
    controller = new CustomerPointController(
      customerPointService as unknown as CustomerPointService,
    );
  });

  describe('permission metadata (Prompt 032)', () => {
    it.each([
      ['add', 'point:add'],
      ['use', 'point:use'],
      ['history', 'point:view'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('add ủy quyền cho service kèm actor context', async () => {
    customerPointService.addPoint.mockResolvedValue({
      id: 'ledger-1',
    } as never);
    const dto = { customerId: 'cus-1', point: 100 } as never;
    await controller.add(dto, user as never, req);

    const actor: ActorContext = customerPointService.addPoint.mock.calls[0][1];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('use ủy quyền cho service kèm actor context', async () => {
    customerPointService.usePoint.mockResolvedValue({
      id: 'ledger-2',
    } as never);
    const dto = { customerId: 'cus-1', point: 30 } as never;
    await controller.use(dto, user as never, req);
    expect(customerPointService.usePoint).toHaveBeenCalledWith(
      dto,
      expect.any(Object),
    );
  });

  it('history chỉ truyền query và organizationId', async () => {
    customerPointService.getHistory.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { customerId: 'cus-1' } as never;
    await controller.history(query, user as never);
    expect(customerPointService.getHistory).toHaveBeenCalledWith(
      query,
      'org-1',
    );
  });
});
