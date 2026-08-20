import { Prisma } from '@prisma/client';
import {
  SalesReturnConcurrencyRetryError,
  SalesReturnInvalidTransitionError,
  SalesReturnQtyExceededError,
  SalesReturnRefundAmountInvalidError,
  SalesReturnRefundInvalidTransitionError,
  SalesReturnVersionConflictError,
} from '../../domain/errors/sales-return.errors';
import { PrismaSalesReturnRepository } from './prisma-sales-return.repository';

const D = (v: string | number) => new Prisma.Decimal(v);

describe('PrismaSalesReturnRepository', () => {
  let repository: PrismaSalesReturnRepository;
  let prisma: any;
  let refundOperationRepository: any;

  const rawItem = {
    id: 'item-1',
    invoiceItemId: 'invitem-1',
    productId: 'prod-1',
    warehouseId: 'wh-1',
    quantity: D('2.000'),
    unitPrice: D('100000.00'),
    discount: D('0.00'),
    taxAmount: D('20000.00'),
    totalAmount: D('220000.00'),
    productCodeSnapshot: 'SP000001',
    productNameSnapshot: 'Áo thun',
    unitNameSnapshot: 'Cái',
    reason: 'DAMAGED',
    reasonNote: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const rawSalesReturn = {
    id: 'sr-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    invoiceId: 'inv-1',
    customerId: 'cus-1',
    code: 'SR000001',
    status: 'DRAFT',
    totalAmount: D('220000.00'),
    note: null,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    version: 1,
    items: [rawItem],
    refunds: [],
  };

  const createItemInput = {
    invoiceItemId: 'invitem-1',
    productId: 'prod-1',
    warehouseId: 'wh-1',
    quantity: 2,
    unitPrice: 100000,
    discount: 0,
    taxAmount: 20000,
    totalAmount: 220000,
    productCodeSnapshot: 'SP000001',
    productNameSnapshot: 'Áo thun',
    unitNameSnapshot: 'Cái',
    reason: 'DAMAGED' as const,
    reasonNote: null,
  };

  beforeEach(() => {
    prisma = {
      salesReturn: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findFirstOrThrow: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      salesReturnItem: {
        deleteMany: jest.fn(),
        aggregate: jest.fn(),
      },
      salesReturnRefund: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn(),
      },
      invoiceItem: {
        findUniqueOrThrow: jest.fn(),
      },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    };
    refundOperationRepository = { markCompleted: jest.fn() };
    repository = new PrismaSalesReturnRepository(
      prisma,
      refundOperationRepository,
    );
  });

  describe('create', () => {
    it('tính totalAmount = tổng item.totalAmount, tạo kèm items', async () => {
      prisma.salesReturn.create.mockResolvedValue(rawSalesReturn);
      const result = await repository.create({
        organizationId: 'org-1',
        branchId: 'branch-1',
        invoiceId: 'inv-1',
        customerId: 'cus-1',
        code: 'SR000001',
        note: null,
        items: [createItemInput],
        createdBy: 'user-1',
      });
      expect(prisma.salesReturn.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalAmount: 220000 }),
        }),
      );
      expect(result.code).toBe('SR000001');
      expect(result.items).toHaveLength(1);
    });
  });

  const rawRefund = {
    id: 'refund-1',
    salesReturnId: 'sr-1',
    amount: D('100000.00'),
    method: 'CASH',
    status: 'PENDING',
    externalReference: null,
    failureReason: null,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    version: 1,
  };

  describe('findById', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.salesReturn.findFirst.mockResolvedValue(null);
      await expect(repository.findById('sr-x', 'org-1')).resolves.toBeNull();
    });

    it('map đúng cả refunds lồng bên trong (toEntity -> toRefundEntity)', async () => {
      prisma.salesReturn.findFirst.mockResolvedValue({
        ...rawSalesReturn,
        refunds: [rawRefund],
      });
      const result = await repository.findById('sr-1', 'org-1');
      expect(result?.refunds).toHaveLength(1);
      expect(result?.refunds[0]).toMatchObject({
        id: 'refund-1',
        amount: '100000',
        status: 'PENDING',
      });
    });
  });

  describe('search', () => {
    it('lọc theo organizationId/status/search, phân trang', async () => {
      prisma.$transaction.mockResolvedValue([[rawSalesReturn], 1]);
      const result = await repository.search({
        organizationId: 'org-1',
        status: 'DRAFT',
        search: 'SR000001',
        page: 1,
        limit: 20,
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.total).toBe(1);
      expect(result.items[0].code).toBe('SR000001');
    });
  });

  describe('updateDraft', () => {
    function buildDraftTx(overrides: Record<string, unknown> = {}): any {
      return {
        salesReturn: {
          findFirst: jest.fn().mockResolvedValue(rawSalesReturn),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findFirstOrThrow: jest.fn().mockResolvedValue({
            ...rawSalesReturn,
            note: 'note mới',
            version: 2,
          }),
        },
        salesReturnItem: { deleteMany: jest.fn() },
        ...overrides,
      };
    }

    it('cập nhật note thành công khi đang DRAFT', async () => {
      const tx = buildDraftTx();
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(tx),
      );
      const result = await repository.updateDraft('sr-1', 'org-1', 1, {
        note: 'note mới',
        updatedBy: 'user-1',
      });
      expect(result.note).toBe('note mới');
      expect(tx.salesReturnItem.deleteMany).not.toHaveBeenCalled();
    });

    it('xóa item cũ rồi tạo lại khi input.items có giá trị', async () => {
      const tx = buildDraftTx();
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(tx),
      );
      await repository.updateDraft('sr-1', 'org-1', 1, {
        items: [createItemInput],
        updatedBy: 'user-1',
      });
      expect(tx.salesReturnItem.deleteMany).toHaveBeenCalledWith({
        where: { salesReturnId: 'sr-1' },
      });
      expect(tx.salesReturn.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalAmount: 220000 }),
        }),
      );
    });

    it('ném SalesReturnNotFoundError khi không tồn tại', async () => {
      const tx = buildDraftTx({
        salesReturn: {
          findFirst: jest.fn().mockResolvedValue(null),
          updateMany: jest.fn(),
          findFirstOrThrow: jest.fn(),
        },
      });
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(tx),
      );
      await expect(
        repository.updateDraft('sr-x', 'org-1', 1, { updatedBy: 'user-1' }),
      ).rejects.toThrow('Không tìm thấy phiếu trả hàng');
    });

    it('ném SalesReturnInvalidTransitionError khi status khác DRAFT', async () => {
      const tx = buildDraftTx({
        salesReturn: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ ...rawSalesReturn, status: 'SUBMITTED' }),
          updateMany: jest.fn(),
          findFirstOrThrow: jest.fn(),
        },
      });
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(tx),
      );
      await expect(
        repository.updateDraft('sr-1', 'org-1', 1, { updatedBy: 'user-1' }),
      ).rejects.toThrow(SalesReturnInvalidTransitionError);
    });

    it('ném SalesReturnVersionConflictError khi version không khớp', async () => {
      const tx = buildDraftTx();
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(tx),
      );
      await expect(
        repository.updateDraft('sr-1', 'org-1', 99, { updatedBy: 'user-1' }),
      ).rejects.toThrow(SalesReturnVersionConflictError);
    });

    it('ném SalesReturnVersionConflictError khi race làm updateMany trả count=0', async () => {
      const tx = buildDraftTx({
        salesReturn: {
          findFirst: jest.fn().mockResolvedValue(rawSalesReturn),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          findFirstOrThrow: jest.fn(),
        },
      });
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(tx),
      );
      await expect(
        repository.updateDraft('sr-1', 'org-1', 1, { updatedBy: 'user-1' }),
      ).rejects.toThrow(SalesReturnVersionConflictError);
    });
  });

  describe('submit/approve/complete — transitionSimple', () => {
    it('DRAFT → SUBMITTED thành công', async () => {
      prisma.salesReturn.findFirst.mockResolvedValue(rawSalesReturn);
      prisma.salesReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.salesReturn.findFirstOrThrow.mockResolvedValue({
        ...rawSalesReturn,
        status: 'SUBMITTED',
        version: 2,
      });
      const result = await repository.submit('sr-1', 'org-1', 1, 'user-1');
      expect(result.status).toBe('SUBMITTED');
    });

    it('ném SalesReturnInvalidTransitionError khi status hiện tại sai', async () => {
      prisma.salesReturn.findFirst.mockResolvedValue({
        ...rawSalesReturn,
        status: 'CANCELLED',
      });
      await expect(
        repository.submit('sr-1', 'org-1', 1, 'user-1'),
      ).rejects.toThrow(SalesReturnInvalidTransitionError);
    });

    it('ném SalesReturnVersionConflictError khi version không khớp', async () => {
      prisma.salesReturn.findFirst.mockResolvedValue(rawSalesReturn);
      await expect(
        repository.submit('sr-1', 'org-1', 99, 'user-1'),
      ).rejects.toThrow(SalesReturnVersionConflictError);
    });

    it('ném SalesReturnVersionConflictError khi race làm updateMany trả count=0', async () => {
      prisma.salesReturn.findFirst.mockResolvedValue(rawSalesReturn);
      prisma.salesReturn.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.submit('sr-1', 'org-1', 1, 'user-1'),
      ).rejects.toThrow(SalesReturnVersionConflictError);
    });

    it('approve: SUBMITTED → APPROVED thành công', async () => {
      prisma.salesReturn.findFirst.mockResolvedValue({
        ...rawSalesReturn,
        status: 'SUBMITTED',
      });
      prisma.salesReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.salesReturn.findFirstOrThrow.mockResolvedValue({
        ...rawSalesReturn,
        status: 'APPROVED',
        version: 2,
      });
      const result = await repository.approve('sr-1', 'org-1', 1, 'user-1');
      expect(result.status).toBe('APPROVED');
    });

    it('complete: RECEIVED → COMPLETED thành công', async () => {
      prisma.salesReturn.findFirst.mockResolvedValue({
        ...rawSalesReturn,
        status: 'RECEIVED',
      });
      prisma.salesReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.salesReturn.findFirstOrThrow.mockResolvedValue({
        ...rawSalesReturn,
        status: 'COMPLETED',
        version: 2,
      });
      const result = await repository.complete('sr-1', 'org-1', 1, 'user-1');
      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('receive — Decision AD44 serialization boundary', () => {
    const approvedReturn = { ...rawSalesReturn, status: 'APPROVED' as const };

    function buildTx(overrides: Record<string, unknown> = {}): any {
      return {
        salesReturn: {
          findFirst: jest.fn().mockResolvedValue(approvedReturn),
          findFirstOrThrow: jest.fn().mockResolvedValue({
            ...approvedReturn,
            status: 'RECEIVED',
            version: 2,
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        salesReturnItem: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: null } }),
        },
        invoiceItem: {
          findUniqueOrThrow: jest
            .fn()
            .mockResolvedValue({ quantity: D('10.000') }),
        },
        $queryRaw: jest.fn().mockResolvedValue([]),
        ...overrides,
      } as any;
    }

    it('khóa InvoiceItem theo thứ tự cố định, tính lại eligibility, chuyển RECEIVED', async () => {
      const tx = buildTx();
      const result = await repository.receive(tx, 'sr-1', 'org-1', 1, 'user-1');

      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tx.salesReturnItem.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            invoiceItemId: 'invitem-1',
            salesReturn: { status: { in: ['RECEIVED', 'COMPLETED'] } },
          }),
        }),
      );
      expect(tx.salesReturn.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sr-1', organizationId: 'org-1', version: 1 },
          data: expect.objectContaining({ status: 'RECEIVED' }),
        }),
      );
      expect(result.status).toBe('RECEIVED');
    });

    it('ném SalesReturnQtyExceededError khi requestedQty > eligibleQty', async () => {
      const tx = buildTx({
        invoiceItem: {
          findUniqueOrThrow: jest
            .fn()
            .mockResolvedValue({ quantity: D('1.000') }), // sold=1, item requests 2
        },
      });
      await expect(
        repository.receive(tx, 'sr-1', 'org-1', 1, 'user-1'),
      ).rejects.toThrow(SalesReturnQtyExceededError);
      expect(tx.salesReturn.updateMany).not.toHaveBeenCalled();
    });

    it('trừ đúng số lượng đã RECEIVED/COMPLETED trước đó khi tính eligibility', async () => {
      const tx = buildTx({
        salesReturnItem: {
          aggregate: jest
            .fn()
            .mockResolvedValue({ _sum: { quantity: D('9.000') } }),
        },
        invoiceItem: {
          findUniqueOrThrow: jest
            .fn()
            .mockResolvedValue({ quantity: D('10.000') }),
        },
        // sold=10, đã return 9 -> eligible=1, request=2 -> vượt
      });
      await expect(
        repository.receive(tx, 'sr-1', 'org-1', 1, 'user-1'),
      ).rejects.toThrow(SalesReturnQtyExceededError);
    });

    it('ném SalesReturnConcurrencyRetryError khi $queryRaw thất bại (deadlock/lock timeout)', async () => {
      const tx = buildTx({
        $queryRaw: jest.fn().mockRejectedValue(new Error('deadlock detected')),
      });
      await expect(
        repository.receive(tx, 'sr-1', 'org-1', 1, 'user-1'),
      ).rejects.toThrow(SalesReturnConcurrencyRetryError);
    });

    it('ném SalesReturnInvalidTransitionError khi status hiện tại không phải APPROVED', async () => {
      const tx = buildTx({
        salesReturn: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ ...approvedReturn, status: 'DRAFT' }),
          findFirstOrThrow: jest.fn(),
          updateMany: jest.fn(),
        },
      });
      await expect(
        repository.receive(tx, 'sr-1', 'org-1', 1, 'user-1'),
      ).rejects.toThrow(SalesReturnInvalidTransitionError);
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('ném SalesReturnVersionConflictError khi version không khớp trước khi khóa', async () => {
      const tx = buildTx();
      await expect(
        repository.receive(tx, 'sr-1', 'org-1', 99, 'user-1'),
      ).rejects.toThrow(SalesReturnVersionConflictError);
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('ném SalesReturnVersionConflictError khi race làm updateMany trả count=0 sau khi qua validate', async () => {
      const tx = buildTx({
        salesReturn: {
          findFirst: jest.fn().mockResolvedValue(approvedReturn),
          findFirstOrThrow: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      });
      await expect(
        repository.receive(tx, 'sr-1', 'org-1', 1, 'user-1'),
      ).rejects.toThrow(SalesReturnVersionConflictError);
    });
  });

  describe('cancel', () => {
    it('APPROVED → CANCELLED thành công (một trong 3 trạng thái cho phép)', async () => {
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn({
          salesReturn: {
            findFirst: jest
              .fn()
              .mockResolvedValue({ ...rawSalesReturn, status: 'APPROVED' }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findFirstOrThrow: jest.fn().mockResolvedValue({
              ...rawSalesReturn,
              status: 'CANCELLED',
              version: 2,
            }),
          },
        }),
      );
      const result = await repository.cancel('sr-1', 'org-1', 1, 'user-1');
      expect(result.status).toBe('CANCELLED');
    });

    it('ném SalesReturnInvalidTransitionError khi đã RECEIVED', async () => {
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn({
          salesReturn: {
            findFirst: jest
              .fn()
              .mockResolvedValue({ ...rawSalesReturn, status: 'RECEIVED' }),
            updateMany: jest.fn(),
            findFirstOrThrow: jest.fn(),
          },
        }),
      );
      await expect(
        repository.cancel('sr-1', 'org-1', 1, 'user-1'),
      ).rejects.toThrow(SalesReturnInvalidTransitionError);
    });
  });

  describe('Refund lifecycle', () => {
    const rawRefund = {
      id: 'refund-1',
      salesReturnId: 'sr-1',
      amount: D('220000.00'),
      method: 'CASH',
      status: 'PENDING',
      externalReference: null,
      failureReason: null,
      createdBy: 'user-1',
      updatedBy: 'user-1',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      version: 1,
    };

    it('createRefund khóa SalesReturn (FOR UPDATE), tạo refund, đánh dấu operation COMPLETED trong CÙNG tx', async () => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'sr-1' }]),
        salesReturn: {
          findFirst: jest.fn().mockResolvedValue({
            ...rawSalesReturn,
            status: 'RECEIVED',
            totalAmount: D('220000.00'),
            refunds: [],
          }),
        },
        salesReturnRefund: {
          create: jest.fn().mockResolvedValue(rawRefund),
        },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(tx),
      );

      const result = await repository.createRefund({
        organizationId: 'org-1',
        salesReturnId: 'sr-1',
        amount: 220000,
        method: 'CASH',
        externalReference: null,
        createdBy: 'user-1',
        idempotencyOperationId: 'operation-1',
      });

      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(result.status).toBe('PENDING');
      expect(refundOperationRepository.markCompleted).toHaveBeenCalledWith(
        'operation-1',
        'refund-1',
        tx,
      );
    });

    it('createRefund ném SalesReturnRefundAmountInvalidError khi vượt cap (dưới khóa)', async () => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'sr-1' }]),
        salesReturn: {
          findFirst: jest.fn().mockResolvedValue({
            ...rawSalesReturn,
            status: 'RECEIVED',
            totalAmount: D('150000.00'),
            refunds: [
              { ...rawRefund, amount: D('100000.00'), status: 'COMPLETED' },
            ],
          }),
        },
        salesReturnRefund: { create: jest.fn() },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(tx),
      );

      await expect(
        repository.createRefund({
          organizationId: 'org-1',
          salesReturnId: 'sr-1',
          amount: 100000,
          method: 'CASH',
          externalReference: null,
          createdBy: 'user-1',
          idempotencyOperationId: 'operation-1',
        }),
      ).rejects.toThrow(SalesReturnRefundAmountInvalidError);
      expect(tx.salesReturnRefund.create).not.toHaveBeenCalled();
    });

    it('processRefund PENDING → PROCESSING', async () => {
      prisma.salesReturnRefund.findFirst.mockResolvedValue(rawRefund);
      prisma.salesReturnRefund.updateMany.mockResolvedValue({ count: 1 });
      prisma.salesReturnRefund.findUniqueOrThrow.mockResolvedValue({
        ...rawRefund,
        status: 'PROCESSING',
        version: 2,
      });
      const result = await repository.processRefund(
        'refund-1',
        'org-1',
        1,
        'user-1',
      );
      expect(result.status).toBe('PROCESSING');
    });

    it('failRefund ném lỗi khi không ở PROCESSING', async () => {
      prisma.salesReturnRefund.findFirst.mockResolvedValue(rawRefund); // PENDING
      await expect(
        repository.failRefund('refund-1', 'org-1', 1, 'lý do', 'user-1'),
      ).rejects.toThrow(SalesReturnRefundInvalidTransitionError);
    });

    it('failRefund PROCESSING → FAILED thành công', async () => {
      prisma.salesReturnRefund.findFirst.mockResolvedValue({
        ...rawRefund,
        status: 'PROCESSING',
      });
      prisma.salesReturnRefund.updateMany.mockResolvedValue({ count: 1 });
      prisma.salesReturnRefund.findUniqueOrThrow.mockResolvedValue({
        ...rawRefund,
        status: 'FAILED',
        failureReason: 'lý do',
        version: 2,
      });
      const result = await repository.failRefund(
        'refund-1',
        'org-1',
        1,
        'lý do',
        'user-1',
      );
      expect(result.status).toBe('FAILED');
    });

    it('completeRefund PROCESSING → COMPLETED thành công', async () => {
      prisma.salesReturnRefund.findFirst.mockResolvedValue({
        ...rawRefund,
        status: 'PROCESSING',
      });
      prisma.salesReturnRefund.updateMany.mockResolvedValue({ count: 1 });
      prisma.salesReturnRefund.findUniqueOrThrow.mockResolvedValue({
        ...rawRefund,
        status: 'COMPLETED',
        version: 2,
      });
      const result = await repository.completeRefund(
        'refund-1',
        'org-1',
        1,
        'user-1',
      );
      expect(result.status).toBe('COMPLETED');
    });

    it('findRefundById trả entity khi tồn tại, null khi không', async () => {
      prisma.salesReturnRefund.findFirst.mockResolvedValueOnce(rawRefund);
      const found = await repository.findRefundById('refund-1', 'org-1');
      expect(found?.status).toBe('PENDING');

      prisma.salesReturnRefund.findFirst.mockResolvedValueOnce(null);
      await expect(
        repository.findRefundById('refund-x', 'org-1'),
      ).resolves.toBeNull();
    });

    it('cancelRefund PENDING → CANCELLED', async () => {
      prisma.salesReturnRefund.findFirst.mockResolvedValue(rawRefund);
      prisma.salesReturnRefund.updateMany.mockResolvedValue({ count: 1 });
      prisma.salesReturnRefund.findUniqueOrThrow.mockResolvedValue({
        ...rawRefund,
        status: 'CANCELLED',
        version: 2,
      });
      const result = await repository.cancelRefund(
        'refund-1',
        'org-1',
        1,
        'user-1',
      );
      expect(result.status).toBe('CANCELLED');
    });
  });
});
