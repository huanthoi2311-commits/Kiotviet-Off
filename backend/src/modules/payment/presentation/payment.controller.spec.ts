import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { PaymentService } from '../application/payment.service';
import { PaymentController } from './payment.controller';

describe('PaymentController', () => {
  let controller: PaymentController;
  let paymentService: jest.Mocked<
    Pick<PaymentService, 'getById' | 'getByInvoiceId'>
  >;
  const reflector = new Reflector();

  const user = {
    sub: 'user-1',
    organizationId: 'org-1',
    permissions: [],
    permissionVersion: 1,
    email: 'a@b.com',
  };

  beforeEach(() => {
    paymentService = {
      getById: jest.fn(),
      getByInvoiceId: jest.fn(),
    };
    controller = new PaymentController(
      paymentService as unknown as PaymentService,
    );
  });

  it('yêu cầu quyền payment:view ở cấp Controller', () => {
    const permissions = reflector.get<string[]>(
      PERMISSIONS_KEY,
      PaymentController,
    );
    expect(permissions).toEqual(['payment:view']);
  });

  it('getById ủy quyền cho service kèm organizationId', async () => {
    paymentService.getById.mockResolvedValue({ id: 'pay-1' } as never);
    await controller.getById('pay-1', user as never);
    expect(paymentService.getById).toHaveBeenCalledWith('pay-1', 'org-1');
  });

  it('getByInvoiceId ủy quyền cho service kèm organizationId', async () => {
    paymentService.getByInvoiceId.mockResolvedValue([]);
    await controller.getByInvoiceId('invoice-1', user as never);
    expect(paymentService.getByInvoiceId).toHaveBeenCalledWith(
      'invoice-1',
      'org-1',
    );
  });
});
