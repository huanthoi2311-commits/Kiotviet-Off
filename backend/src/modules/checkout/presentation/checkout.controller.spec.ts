import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { ActorContext, CheckoutService } from '../application/checkout.service';
import { CheckoutController } from './checkout.controller';

describe('CheckoutController', () => {
  let controller: CheckoutController;
  let checkoutService: jest.Mocked<Pick<CheckoutService, 'checkout'>>;
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

  const dto = {
    branchId: 'branch-1',
    warehouseId: 'wh-1',
    paymentMethod: 'CASH',
  } as never;

  beforeEach(() => {
    checkoutService = { checkout: jest.fn() };
    controller = new CheckoutController(
      checkoutService as unknown as CheckoutService,
    );
  });

  it('yêu cầu quyền pos:access ở cấp Controller', () => {
    const permissions = reflector.get<string[]>(
      PERMISSIONS_KEY,
      CheckoutController,
    );
    expect(permissions).toEqual(['pos:access']);
  });

  it('[T013] ném BadRequestException khi thiếu header Idempotency-Key', async () => {
    await expect(
      controller.checkout(dto, '', user as never, req),
    ).rejects.toThrow(BadRequestException);
    expect(checkoutService.checkout).not.toHaveBeenCalled();
  });

  it('[T013] ném BadRequestException khi header Idempotency-Key là undefined', async () => {
    await expect(
      controller.checkout(dto, undefined as never, user as never, req),
    ).rejects.toThrow(BadRequestException);
  });

  it('checkout ủy quyền cho service kèm dto + idempotencyKey + actor context (ip/userAgent)', async () => {
    checkoutService.checkout.mockResolvedValue({
      invoice: { id: 'inv-1' },
      payment: { id: 'pay-1' },
    } as never);

    await controller.checkout(dto, 'idem-key-1', user as never, req);

    const actor: ActorContext = checkoutService.checkout.mock.calls[0][1];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
    expect(checkoutService.checkout).toHaveBeenCalledWith(
      dto,
      actor,
      'idem-key-1',
    );
  });
});
