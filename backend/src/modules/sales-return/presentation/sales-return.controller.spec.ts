import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import {
  ActorContext,
  SalesReturnService,
} from '../application/sales-return.service';
import { RefundDomainService } from '../application/refund-domain.service';
import { SalesReturnController } from './sales-return.controller';

describe('SalesReturnController', () => {
  let controller: SalesReturnController;
  let salesReturnService: jest.Mocked<
    Pick<
      SalesReturnService,
      | 'create'
      | 'search'
      | 'getInvoiceEligibility'
      | 'findOne'
      | 'updateDraft'
      | 'submit'
      | 'approve'
      | 'receive'
      | 'complete'
      | 'cancel'
    >
  >;
  let refundDomainService: jest.Mocked<
    Pick<
      RefundDomainService,
      'createRefund' | 'process' | 'complete' | 'fail' | 'cancel'
    >
  >;
  const reflector = new Reflector();

  const user = {
    sub: 'user-1',
    organizationId: 'org-1',
    branchId: null,
    permissions: [],
    permissionVersion: 1,
    email: 'a@b.com',
    isPlatformAdmin: false,
  };
  const salesReturnEntity = {
    id: 'sr-1',
    status: 'DRAFT',
    items: [],
    refunds: [],
  } as never;
  const refundEntity = {
    id: 'refund-1',
    salesReturnId: 'sr-1',
    status: 'PENDING',
  } as never;

  beforeEach(() => {
    salesReturnService = {
      create: jest.fn().mockResolvedValue(salesReturnEntity),
      search: jest
        .fn()
        .mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
      getInvoiceEligibility: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(salesReturnEntity),
      updateDraft: jest.fn().mockResolvedValue(salesReturnEntity),
      submit: jest.fn().mockResolvedValue(salesReturnEntity),
      approve: jest.fn().mockResolvedValue(salesReturnEntity),
      receive: jest.fn().mockResolvedValue(salesReturnEntity),
      complete: jest.fn().mockResolvedValue(salesReturnEntity),
      cancel: jest.fn().mockResolvedValue(salesReturnEntity),
    };
    refundDomainService = {
      createRefund: jest.fn().mockResolvedValue(refundEntity),
      process: jest.fn().mockResolvedValue(refundEntity),
      complete: jest.fn().mockResolvedValue(refundEntity),
      fail: jest.fn().mockResolvedValue(refundEntity),
      cancel: jest.fn().mockResolvedValue(refundEntity),
    };
    controller = new SalesReturnController(
      salesReturnService as unknown as SalesReturnService,
      refundDomainService as unknown as RefundDomainService,
    );
  });

  describe('permission metadata (SPEC-T014 §6)', () => {
    it.each([
      ['create', 'sales_return:create'],
      ['search', 'sales_return:view'],
      ['eligibility', 'sales_return:view'],
      ['findOne', 'sales_return:view'],
      ['updateDraft', 'sales_return:update'],
      ['submit', 'sales_return:submit'],
      ['approve', 'sales_return:approve'],
      ['receive', 'sales_return:receive'],
      ['complete', 'sales_return:complete'],
      ['cancel', 'sales_return:cancel'],
      ['createRefund', 'sales_return:refund'],
      ['processRefund', 'sales_return:refund'],
      ['completeRefund', 'sales_return:refund'],
      ['failRefund', 'sales_return:refund'],
      ['cancelRefund', 'sales_return:refund'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('create ủy quyền cho service kèm actor context, map entity -> response dto', async () => {
    const dto = {
      invoiceId: 'invoice-1',
      note: 'ghi chú',
      items: [
        { invoiceItemId: 'ii-1', quantity: 1, reason: 'DAMAGED' as const },
      ],
    };
    const result = await controller.create(dto, user);

    expect(salesReturnService.create).toHaveBeenCalledWith(
      { invoiceId: 'invoice-1', note: 'ghi chú', items: dto.items },
      { userId: 'user-1', organizationId: 'org-1' } satisfies ActorContext,
    );
    expect(result.id).toBe('sr-1');
  });

  it('search truyền organizationId + query đã default page/limit', async () => {
    await controller.search({}, user);
    expect(salesReturnService.search).toHaveBeenCalledWith({
      organizationId: 'org-1',
      invoiceId: undefined,
      status: undefined,
      search: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('eligibility ủy quyền cho service.getInvoiceEligibility', async () => {
    await controller.eligibility('invoice-1', user);
    expect(salesReturnService.getInvoiceEligibility).toHaveBeenCalledWith(
      'invoice-1',
      'org-1',
    );
  });

  it('findOne ủy quyền cho service.findOne kèm organizationId', async () => {
    const result = await controller.findOne('sr-1', user);
    expect(salesReturnService.findOne).toHaveBeenCalledWith('sr-1', 'org-1');
    expect(result.id).toBe('sr-1');
  });

  it('updateDraft truyền version + note + items', async () => {
    await controller.updateDraft('sr-1', { version: 1, note: 'x' }, user);
    expect(salesReturnService.updateDraft).toHaveBeenCalledWith(
      'sr-1',
      1,
      { note: 'x', items: undefined },
      { userId: 'user-1', organizationId: 'org-1' },
    );
  });

  it.each([
    ['submit', 'submit'],
    ['approve', 'approve'],
    ['receive', 'receive'],
    ['complete', 'complete'],
    ['cancel', 'cancel'],
  ] as const)(
    '%s ủy quyền cho service.%s kèm version + actor',
    async (method, serviceMethod) => {
      expect(method).toBe(serviceMethod);
      await (
        controller[method] as (
          id: string,
          dto: { version: number },
          user: unknown,
        ) => Promise<unknown>
      )('sr-1', { version: 2 }, user);
      expect(salesReturnService[method]).toHaveBeenCalledWith('sr-1', 2, {
        userId: 'user-1',
        organizationId: 'org-1',
      });
    },
  );

  it('createRefund ủy quyền cho refundDomainService.createRefund', async () => {
    await controller.createRefund(
      'sr-1',
      { amount: 50000, method: 'CASH' },
      user,
    );
    expect(refundDomainService.createRefund).toHaveBeenCalledWith(
      {
        salesReturnId: 'sr-1',
        amount: 50000,
        method: 'CASH',
        externalReference: null,
      },
      { userId: 'user-1', organizationId: 'org-1' },
    );
  });

  it('processRefund/completeRefund/cancelRefund ủy quyền đúng method với version', async () => {
    await controller.processRefund('refund-1', { version: 1 }, user);
    expect(refundDomainService.process).toHaveBeenCalledWith('refund-1', 1, {
      userId: 'user-1',
      organizationId: 'org-1',
    });

    await controller.completeRefund('refund-1', { version: 1 }, user);
    expect(refundDomainService.complete).toHaveBeenCalledWith('refund-1', 1, {
      userId: 'user-1',
      organizationId: 'org-1',
    });

    await controller.cancelRefund('refund-1', { version: 1 }, user);
    expect(refundDomainService.cancel).toHaveBeenCalledWith('refund-1', 1, {
      userId: 'user-1',
      organizationId: 'org-1',
    });
  });

  it('failRefund truyền version + failureReason', async () => {
    await controller.failRefund(
      'refund-1',
      { version: 1, failureReason: 'thẻ bị từ chối' },
      user,
    );
    expect(refundDomainService.fail).toHaveBeenCalledWith(
      'refund-1',
      1,
      'thẻ bị từ chối',
      { userId: 'user-1', organizationId: 'org-1' },
    );
  });
});
