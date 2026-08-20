import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { DomainEventPublisher } from '../../platform/events/domain-event-publisher.service';
import {
  SalesReturnNotFoundError,
  SalesReturnNotReceivedForRefundError,
  SalesReturnRefundAmountInvalidError,
  SalesReturnRefundInvalidTransitionError,
  SalesReturnRefundNotFoundError,
  SalesReturnRefundVersionConflictError,
} from '../domain/errors/sales-return.errors';
import {
  SALES_RETURN_REFUND_COMPLETED_EVENT,
  SALES_RETURN_REFUND_CREATED_EVENT,
  SALES_RETURN_REFUND_FAILED_EVENT,
} from '../domain/events/sales-return.events';
import { ISalesReturnRepository } from '../domain/repositories/sales-return.repository.interface';
import { RefundDomainService } from './refund-domain.service';
import { SalesReturnRefundOperationService } from './sales-return-refund-operation.service';

describe('RefundDomainService', () => {
  let service: RefundDomainService;
  let salesReturnRepository: jest.Mocked<ISalesReturnRepository>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;
  let eventPublisher: jest.Mocked<Pick<DomainEventPublisher, 'publish'>>;
  let refundOperationService: jest.Mocked<
    Pick<SalesReturnRefundOperationService, 'reserve' | 'markFailed'>
  >;

  const actor = { userId: 'user-1', organizationId: 'org-1' };
  const idempotencyKey = 'idem-key-1';

  const refundEntity = {
    id: 'refund-1',
    salesReturnId: 'sr-1',
    amount: '100000.00',
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

  beforeEach(() => {
    salesReturnRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      search: jest.fn(),
      updateDraft: jest.fn(),
      submit: jest.fn(),
      approve: jest.fn(),
      receive: jest.fn(),
      complete: jest.fn(),
      cancel: jest.fn(),
      createRefund: jest.fn().mockResolvedValue(refundEntity),
      findRefundById: jest.fn(),
      processRefund: jest.fn(),
      completeRefund: jest.fn(),
      failRefund: jest.fn(),
      cancelRefund: jest.fn(),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    eventPublisher = { publish: jest.fn() };
    refundOperationService = {
      reserve: jest
        .fn()
        .mockResolvedValue({ kind: 'NEW', operationId: 'operation-1' }),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };

    service = new RefundDomainService(
      salesReturnRepository,
      auditLogService as unknown as AuditLogService,
      eventPublisher as unknown as DomainEventPublisher,
      refundOperationService as unknown as SalesReturnRefundOperationService,
    );
  });

  describe('createRefund', () => {
    it('gọi reserve() với organizationId/idempotencyKey/payload TRƯỚC khi gọi repository', async () => {
      await service.createRefund(
        { salesReturnId: 'sr-1', amount: 100000, method: 'CASH' },
        actor,
        idempotencyKey,
      );

      expect(refundOperationService.reserve).toHaveBeenCalledWith({
        organizationId: 'org-1',
        idempotencyKey,
        payload: expect.objectContaining({
          salesReturnId: 'sr-1',
          amount: 100000,
          method: 'CASH',
        }),
      });
    });

    it('tạo Refund thành công, truyền idempotencyOperationId, ghi audit log + publish event', async () => {
      const result = await service.createRefund(
        { salesReturnId: 'sr-1', amount: 100000, method: 'CASH' },
        actor,
        idempotencyKey,
      );
      expect(salesReturnRepository.createRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          salesReturnId: 'sr-1',
          amount: 100000,
          idempotencyOperationId: 'operation-1',
        }),
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sales_return.refund.create' }),
      );
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        SALES_RETURN_REFUND_CREATED_EVENT,
        expect.objectContaining({ salesReturnId: 'sr-1' }),
      );
      expect(result.id).toBe('refund-1');
    });

    it('REPLAY: trả về Refund gốc, KHÔNG gọi createRefund() mới', async () => {
      refundOperationService.reserve.mockResolvedValue({
        kind: 'REPLAY',
        refundId: 'refund-1',
      });
      salesReturnRepository.findRefundById.mockResolvedValue(
        refundEntity as never,
      );

      const result = await service.createRefund(
        { salesReturnId: 'sr-1', amount: 100000, method: 'CASH' },
        actor,
        idempotencyKey,
      );

      expect(result.id).toBe('refund-1');
      expect(salesReturnRepository.findRefundById).toHaveBeenCalledWith(
        'refund-1',
        'org-1',
      );
      expect(salesReturnRepository.createRefund).not.toHaveBeenCalled();
    });

    it('REPLAY nhưng Refund không tồn tại (vi phạm bất biến hạ tầng) → ném lỗi hệ thống chung', async () => {
      refundOperationService.reserve.mockResolvedValue({
        kind: 'REPLAY',
        refundId: 'refund-missing',
      });
      salesReturnRepository.findRefundById.mockResolvedValue(null);

      await expect(
        service.createRefund(
          { salesReturnId: 'sr-1', amount: 100000, method: 'CASH' },
          actor,
          idempotencyKey,
        ),
      ).rejects.toThrow(/invariant violation/);
    });

    it('reserve() ném ConflictException (409) → propagate thẳng ra, KHÔNG gọi markFailed', async () => {
      refundOperationService.reserve.mockRejectedValue(
        new ConflictException('active conflict'),
      );

      await expect(
        service.createRefund(
          { salesReturnId: 'sr-1', amount: 100000, method: 'CASH' },
          actor,
          idempotencyKey,
        ),
      ).rejects.toThrow(ConflictException);
      expect(refundOperationService.markFailed).not.toHaveBeenCalled();
      expect(salesReturnRepository.createRefund).not.toHaveBeenCalled();
    });

    it('ném NotFoundException khi SalesReturn không tồn tại, và markFailed(operationId) được gọi', async () => {
      salesReturnRepository.createRefund.mockRejectedValue(
        new SalesReturnNotFoundError('sr-x'),
      );
      await expect(
        service.createRefund(
          { salesReturnId: 'sr-x', amount: 100000, method: 'CASH' },
          actor,
          idempotencyKey,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(refundOperationService.markFailed).toHaveBeenCalledWith(
        'operation-1',
      );
    });

    it('ném lỗi khi SalesReturn chưa RECEIVED (còn DRAFT/SUBMITTED/APPROVED), và markFailed(operationId) được gọi', async () => {
      salesReturnRepository.createRefund.mockRejectedValue(
        new SalesReturnNotReceivedForRefundError('sr-1', 'APPROVED'),
      );
      await expect(
        service.createRefund(
          { salesReturnId: 'sr-1', amount: 100000, method: 'CASH' },
          actor,
          idempotencyKey,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(refundOperationService.markFailed).toHaveBeenCalledWith(
        'operation-1',
      );
    });

    // T053.06E — công thức cap (amount<=0, vượt totalAmount, loại trừ CANCELLED/FAILED) chuyển
    // xuống repository (chạy dưới khóa `FOR UPDATE`, T053.06E Discovery §14-16). U7 (chứng minh
    // đúng CÔNG THỨC, không cần DB thật) nằm ở `sales-return-refund-cap.policy.spec.ts`; test ở
    // đây chỉ chứng minh Service orchestrate ĐÚNG khi repository ném lỗi cap — mirror cách
    // SupplierDebtService.spec.ts test SupplierPaymentExceedsBalanceError.
    it('dịch SalesReturnRefundAmountInvalidError sang UnprocessableEntityException, và markFailed(operationId) được gọi', async () => {
      salesReturnRepository.createRefund.mockRejectedValue(
        new SalesReturnRefundAmountInvalidError('100000'),
      );
      await expect(
        service.createRefund(
          { salesReturnId: 'sr-1', amount: 100000, method: 'CASH' },
          actor,
          idempotencyKey,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(refundOperationService.markFailed).toHaveBeenCalledWith(
        'operation-1',
      );
    });
  });

  describe('process/complete/fail/cancel', () => {
    it('process PENDING -> PROCESSING', async () => {
      salesReturnRepository.processRefund.mockResolvedValue({
        ...refundEntity,
        status: 'PROCESSING',
      } as never);
      const result = await service.process('refund-1', 1, actor);
      expect(result.status).toBe('PROCESSING');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sales_return.refund.process' }),
      );
    });

    it('process — map lỗi từ repository -> exception tương ứng', async () => {
      salesReturnRepository.processRefund.mockRejectedValue(
        new SalesReturnRefundVersionConflictError('refund-1'),
      );
      await expect(service.process('refund-1', 1, actor)).rejects.toThrow(
        ConflictException,
      );
    });

    it('complete publish SALES_RETURN_REFUND_COMPLETED_EVENT', async () => {
      salesReturnRepository.completeRefund.mockResolvedValue({
        ...refundEntity,
        status: 'COMPLETED',
      } as never);
      await service.complete('refund-1', 1, actor);
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        SALES_RETURN_REFUND_COMPLETED_EVENT,
        expect.objectContaining({ refundId: 'refund-1' }),
      );
    });

    it('complete — map lỗi từ repository -> exception tương ứng', async () => {
      salesReturnRepository.completeRefund.mockRejectedValue(
        new SalesReturnRefundInvalidTransitionError('PENDING', 'COMPLETED'),
      );
      await expect(service.complete('refund-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('fail — map SalesReturnRefundInvalidTransitionError -> UnprocessableEntityException', async () => {
      salesReturnRepository.failRefund.mockRejectedValue(
        new SalesReturnRefundInvalidTransitionError('PENDING', 'FAILED'),
      );
      await expect(service.fail('refund-1', 1, 'lý do', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('fail PROCESSING -> FAILED thành công, publish SALES_RETURN_REFUND_FAILED_EVENT', async () => {
      salesReturnRepository.failRefund.mockResolvedValue({
        ...refundEntity,
        status: 'FAILED',
        failureReason: 'lý do',
      } as never);
      const result = await service.fail('refund-1', 1, 'lý do', actor);
      expect(result.status).toBe('FAILED');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sales_return.refund.fail' }),
      );
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        SALES_RETURN_REFUND_FAILED_EVENT,
        expect.objectContaining({ refundId: 'refund-1' }),
      );
    });

    it('cancel — map SalesReturnRefundVersionConflictError -> ConflictException', async () => {
      salesReturnRepository.cancelRefund.mockRejectedValue(
        new SalesReturnRefundVersionConflictError('refund-1'),
      );
      await expect(service.cancel('refund-1', 1, actor)).rejects.toThrow(
        ConflictException,
      );
    });

    it('cancel PENDING -> CANCELLED thành công', async () => {
      salesReturnRepository.cancelRefund.mockResolvedValue({
        ...refundEntity,
        status: 'CANCELLED',
      } as never);
      const result = await service.cancel('refund-1', 1, actor);
      expect(result.status).toBe('CANCELLED');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sales_return.refund.cancel' }),
      );
    });

    it('map SalesReturnRefundNotFoundError -> NotFoundException', async () => {
      salesReturnRepository.processRefund.mockRejectedValue(
        new SalesReturnRefundNotFoundError('refund-x'),
      );
      await expect(service.process('refund-x', 1, actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('mapError giữ nguyên lỗi không xác định (fallback)', async () => {
      const unknownError = new Error('unexpected');
      salesReturnRepository.processRefund.mockRejectedValue(unknownError);
      await expect(service.process('refund-1', 1, actor)).rejects.toThrow(
        'unexpected',
      );
    });
  });
});
