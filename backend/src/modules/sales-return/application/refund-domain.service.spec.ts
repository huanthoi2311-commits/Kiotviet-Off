import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { DomainEventPublisher } from '../../platform/events/domain-event-publisher.service';
import {
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

describe('RefundDomainService', () => {
  let service: RefundDomainService;
  let salesReturnRepository: jest.Mocked<ISalesReturnRepository>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;
  let eventPublisher: jest.Mocked<Pick<DomainEventPublisher, 'publish'>>;

  const actor = { userId: 'user-1', organizationId: 'org-1' };

  const receivedSalesReturn = {
    id: 'sr-1',
    status: 'RECEIVED',
    totalAmount: '220000.00',
    refunds: [],
  } as never;

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
  } as never;

  beforeEach(() => {
    salesReturnRepository = {
      create: jest.fn(),
      findById: jest.fn().mockResolvedValue(receivedSalesReturn),
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

    service = new RefundDomainService(
      salesReturnRepository,
      auditLogService as unknown as AuditLogService,
      eventPublisher as unknown as DomainEventPublisher,
    );
  });

  describe('createRefund', () => {
    it('tạo Refund khi SalesReturn đã RECEIVED và amount hợp lệ', async () => {
      const result = await service.createRefund(
        { salesReturnId: 'sr-1', amount: 100000, method: 'CASH' },
        actor,
      );
      expect(salesReturnRepository.createRefund).toHaveBeenCalledWith(
        expect.objectContaining({ salesReturnId: 'sr-1', amount: 100000 }),
      );
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        SALES_RETURN_REFUND_CREATED_EVENT,
        expect.objectContaining({ salesReturnId: 'sr-1' }),
      );
      expect(result.id).toBe('refund-1');
    });

    it('ném lỗi khi SalesReturn chưa RECEIVED (còn DRAFT/SUBMITTED/APPROVED)', async () => {
      salesReturnRepository.findById.mockResolvedValue({
        ...receivedSalesReturn,
        status: 'APPROVED',
      } as never);
      await expect(
        service.createRefund(
          { salesReturnId: 'sr-1', amount: 100000, method: 'CASH' },
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(salesReturnRepository.createRefund).not.toHaveBeenCalled();
    });

    it('ném lỗi khi amount <= 0', async () => {
      await expect(
        service.createRefund(
          { salesReturnId: 'sr-1', amount: 0, method: 'CASH' },
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('ném lỗi khi tổng Refund đang active + amount mới vượt SalesReturn.totalAmount', async () => {
      salesReturnRepository.findById.mockResolvedValue({
        ...receivedSalesReturn,
        totalAmount: '150000.00',
        refunds: [
          { ...refundEntity, amount: '100000.00', status: 'COMPLETED' },
        ],
      } as never);
      await expect(
        service.createRefund(
          { salesReturnId: 'sr-1', amount: 100000, method: 'CASH' },
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('bỏ qua Refund CANCELLED/FAILED khi tính tổng active', async () => {
      salesReturnRepository.findById.mockResolvedValue({
        ...receivedSalesReturn,
        totalAmount: '150000.00',
        refunds: [
          { ...refundEntity, amount: '100000.00', status: 'FAILED' },
          { ...refundEntity, amount: '50000.00', status: 'CANCELLED' },
        ],
      } as never);
      // Cả 2 refund cũ đều không active -> vẫn còn đủ 150000 cho refund mới 100000
      await expect(
        service.createRefund(
          { salesReturnId: 'sr-1', amount: 100000, method: 'CASH' },
          actor,
        ),
      ).resolves.toBeDefined();
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

  it('createRefund ném NotFoundException khi SalesReturn không tồn tại', async () => {
    salesReturnRepository.findById.mockResolvedValue(null);
    await expect(
      service.createRefund(
        { salesReturnId: 'sr-x', amount: 100000, method: 'CASH' },
        actor,
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
