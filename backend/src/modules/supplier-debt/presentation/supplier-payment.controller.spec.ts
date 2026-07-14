import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import {
  ActorContext,
  SupplierDebtService,
} from '../application/supplier-debt.service';
import { SupplierPaymentController } from './supplier-payment.controller';

describe('SupplierPaymentController', () => {
  let controller: SupplierPaymentController;
  let supplierDebtService: jest.Mocked<
    Pick<SupplierDebtService, 'createPayment'>
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
    supplierDebtService = { createPayment: jest.fn() };
    controller = new SupplierPaymentController(
      supplierDebtService as unknown as SupplierDebtService,
    );
  });

  it('create yêu cầu permission payment:create', () => {
    const permissions = reflector.get<string[]>(
      PERMISSIONS_KEY,
      controller.create,
    );
    expect(permissions).toEqual(['payment:create']);
  });

  it('create ủy quyền cho service kèm actor context', async () => {
    supplierDebtService.createPayment.mockResolvedValue({
      id: 'payment-1',
    } as never);
    const dto = {
      branchId: 'branch-1',
      supplierId: 'supplier-1',
      method: 'CASH',
      amount: 100000,
      paidAt: '2026-01-01T00:00:00.000Z',
    } as never;
    await controller.create(dto, user as never, req);

    const actor: ActorContext =
      supplierDebtService.createPayment.mock.calls[0][1];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });
});
