import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { SupplierDebtService } from '../application/supplier-debt.service';
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
  const dto = {
    branchId: 'branch-1',
    supplierId: 'supplier-1',
    method: 'CASH',
    amount: 100000,
    paidAt: '2026-01-01T00:00:00.000Z',
  } as never;

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

  it('create ủy quyền cho service kèm actor context + idempotencyKey đã normalize', async () => {
    supplierDebtService.createPayment.mockResolvedValue({
      id: 'payment-1',
    } as never);

    await controller.create(dto, 'idem-key-1', user as never, req);

    const [calledDto, actor, idempotencyKey] =
      supplierDebtService.createPayment.mock.calls[0];
    expect(calledDto).toBe(dto);
    expect(idempotencyKey).toBe('idem-key-1');
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  // T052.05B D2 — required test #13.
  it('ném BadRequestException khi thiếu header Idempotency-Key (undefined)', async () => {
    await expect(
      controller.create(dto, undefined, user as never, req),
    ).rejects.toThrow(BadRequestException);
    expect(supplierDebtService.createPayment).not.toHaveBeenCalled();
  });

  // required test #14.
  it('ném BadRequestException khi header Idempotency-Key rỗng', async () => {
    await expect(
      controller.create(dto, '', user as never, req),
    ).rejects.toThrow(BadRequestException);
  });

  // required test #15 — quyết định RIÊNG của Supplier Payment (khác Checkout, vốn chấp nhận
  // whitespace-only vì `!idempotencyKey` không bắt được chuỗi chỉ có khoảng trắng — T052.05A.1 §6).
  it('ném BadRequestException khi header Idempotency-Key chỉ chứa khoảng trắng', async () => {
    await expect(
      controller.create(dto, '   ', user as never, req),
    ).rejects.toThrow(BadRequestException);
  });

  // required test #16.
  it('chấp nhận idempotency key 255 ký tự (sau trim)', async () => {
    supplierDebtService.createPayment.mockResolvedValue({
      id: 'payment-1',
    } as never);
    const key255 = 'k'.repeat(255);

    await controller.create(dto, key255, user as never, req);

    expect(supplierDebtService.createPayment).toHaveBeenCalledWith(
      dto,
      expect.anything(),
      key255,
    );
  });

  // required test #17.
  it('từ chối idempotency key 256 ký tự (sau trim) — vượt quá giới hạn', async () => {
    const key256 = 'k'.repeat(256);
    await expect(
      controller.create(dto, key256, user as never, req),
    ).rejects.toThrow(BadRequestException);
    expect(supplierDebtService.createPayment).not.toHaveBeenCalled();
  });

  // required test #18 — không yêu cầu định dạng UUID (D2).
  it('chấp nhận idempotency key dạng chuỗi tuỳ ý (không phải UUID)', async () => {
    supplierDebtService.createPayment.mockResolvedValue({
      id: 'payment-1',
    } as never);

    await controller.create(
      dto,
      'not-a-uuid-just-a-string',
      user as never,
      req,
    );

    expect(supplierDebtService.createPayment).toHaveBeenCalledWith(
      dto,
      expect.anything(),
      'not-a-uuid-just-a-string',
    );
  });

  it('trim khoảng trắng đầu/cuối trước khi dùng làm idempotency key', async () => {
    supplierDebtService.createPayment.mockResolvedValue({
      id: 'payment-1',
    } as never);

    await controller.create(
      dto,
      '  idem-key-with-padding  ',
      user as never,
      req,
    );

    expect(supplierDebtService.createPayment).toHaveBeenCalledWith(
      dto,
      expect.anything(),
      'idem-key-with-padding',
    );
  });
});
