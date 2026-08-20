import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { DomainEventPublisher } from '../../platform/events/domain-event-publisher.service';
import { ActorContext } from './sales-return.service';
import { SalesReturnRefundEntity } from '../domain/entities/sales-return.entity';
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
import { SALES_RETURN_REPOSITORY } from '../domain/repositories/sales-return.repository.interface';
import type { ISalesReturnRepository } from '../domain/repositories/sales-return.repository.interface';
import { SalesReturnRefundOperationService } from './sales-return-refund-operation.service';

export interface CreateRefundParams {
  salesReturnId: string;
  amount: number;
  method: 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'E_WALLET';
  externalReference?: string | null;
}

/**
 * T014 Phase 4 (RFC-T014 v1.1 §20/§23, SPEC §15, Decision AD37/AD43) — Refund là aggregate hoàn
 * toàn độc lập với SalesReturn.status, sở hữu bởi SalesReturn nhưng KHÔNG BAO GIỜ ghi vào bảng
 * `payments` (Decision AD32). Mỗi phương thức repository refund là 1 statement/transaction đơn
 * (không cần `$transaction()` tường minh — atomic tự nhiên), tách biệt hoàn toàn với transaction
 * `receive()` của SalesReturn (Phase 3).
 *
 * T053.06E — `createRefund()` giờ orchestrate reserve()/REPLAY/markFailed(), mirror
 * `SupplierDebtService.createPayment()` (T052.05B) chính xác: status-gate + cap-check KHÔNG còn
 * đọc/tính ở tầng Service — chuyển toàn bộ xuống `salesReturnRepository.createRefund()` (chạy
 * dưới khóa `FOR UPDATE`, xem Discovery §14-16). Service chỉ còn orchestrate Idempotency +
 * map lỗi domain → HTTP + audit/event.
 */
@Injectable()
export class RefundDomainService {
  constructor(
    @Inject(SALES_RETURN_REPOSITORY)
    private readonly salesReturnRepository: ISalesReturnRepository,
    private readonly auditLogService: AuditLogService,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly refundOperationService: SalesReturnRefundOperationService,
  ) {}

  async createRefund(
    params: CreateRefundParams,
    actor: ActorContext,
    idempotencyKey: string,
  ): Promise<SalesReturnRefundEntity> {
    const reserveOutcome = await this.refundOperationService.reserve({
      organizationId: actor.organizationId,
      idempotencyKey,
      payload: {
        salesReturnId: params.salesReturnId,
        amount: params.amount,
        method: params.method,
        externalReference: params.externalReference ?? null,
      },
    });

    if (reserveOutcome.kind === 'REPLAY') {
      const refund = await this.salesReturnRepository.findRefundById(
        reserveOutcome.refundId,
        actor.organizationId,
      );
      if (!refund) {
        // Bất biến hạ tầng: markCompleted() ghi refundId TRONG CÙNG transaction với
        // SalesReturnRefund.create() (T053.06E — mirror T052.05A.1 §3) — refund này PHẢI tồn tại
        // qua đường thực thi bình thường. Nếu không, đây là vi phạm bất biến (không phải lỗi
        // nghiệp vụ tự phục hồi được) — không tự bịa mã lỗi nghiệp vụ giả, để lộ ra như lỗi hệ
        // thống chung (mirror SupplierDebtService.createPayment()'s exact pattern).
        throw new Error(
          `Sales return refund idempotency invariant violation: operation completed but refund ${reserveOutcome.refundId} not found for organization ${actor.organizationId}`,
        );
      }
      return refund;
    }

    const operationId = reserveOutcome.operationId;
    try {
      const created = await this.salesReturnRepository.createRefund({
        organizationId: actor.organizationId,
        salesReturnId: params.salesReturnId,
        amount: params.amount,
        method: params.method,
        externalReference: params.externalReference ?? null,
        createdBy: actor.userId,
        idempotencyOperationId: operationId,
      });

      await this.auditLogService.log({
        organizationId: actor.organizationId,
        userId: actor.userId,
        action: 'sales_return.refund.create',
        entityType: 'SalesReturnRefund',
        entityId: created.id,
        newValue: this.toAuditSnapshot(created),
      });
      this.eventPublisher.publish(
        SALES_RETURN_REFUND_CREATED_EVENT,
        this.toLifecycleEvent(created, params.salesReturnId, actor),
      );

      return created;
    } catch (error) {
      // T053.06E (mirror T052.05B/D9) — giải phóng Idempotency-Key ngay cho MỌI lỗi kể từ sau khi
      // reserve() trả NEW — nhánh 409 (fingerprint khác/đang PROCESSING) đã ném ngay trong
      // reserve(), TRƯỚC try-block này, không bao giờ tới đây.
      await this.refundOperationService.markFailed(operationId);
      throw this.mapError(error);
    }
  }

  async process(
    id: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<SalesReturnRefundEntity> {
    try {
      const updated = await this.salesReturnRepository.processRefund(
        id,
        actor.organizationId,
        expectedVersion,
        actor.userId,
      );
      await this.auditLogService.log({
        organizationId: actor.organizationId,
        userId: actor.userId,
        action: 'sales_return.refund.process',
        entityType: 'SalesReturnRefund',
        entityId: id,
        newValue: this.toAuditSnapshot(updated),
      });
      return updated;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async complete(
    id: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<SalesReturnRefundEntity> {
    try {
      const updated = await this.salesReturnRepository.completeRefund(
        id,
        actor.organizationId,
        expectedVersion,
        actor.userId,
      );
      await this.auditLogService.log({
        organizationId: actor.organizationId,
        userId: actor.userId,
        action: 'sales_return.refund.complete',
        entityType: 'SalesReturnRefund',
        entityId: id,
        newValue: this.toAuditSnapshot(updated),
      });
      this.eventPublisher.publish(
        SALES_RETURN_REFUND_COMPLETED_EVENT,
        this.toLifecycleEvent(updated, updated.salesReturnId, actor),
      );
      return updated;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /** PROCESSING → FAILED. KHÔNG hoàn tác Inventory, KHÔNG tự mở lại SalesReturn (Decision AD43). */
  async fail(
    id: string,
    expectedVersion: number,
    failureReason: string,
    actor: ActorContext,
  ): Promise<SalesReturnRefundEntity> {
    try {
      const updated = await this.salesReturnRepository.failRefund(
        id,
        actor.organizationId,
        expectedVersion,
        failureReason,
        actor.userId,
      );
      await this.auditLogService.log({
        organizationId: actor.organizationId,
        userId: actor.userId,
        action: 'sales_return.refund.fail',
        entityType: 'SalesReturnRefund',
        entityId: id,
        newValue: this.toAuditSnapshot(updated),
      });
      this.eventPublisher.publish(
        SALES_RETURN_REFUND_FAILED_EVENT,
        this.toLifecycleEvent(updated, updated.salesReturnId, actor),
      );
      return updated;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async cancel(
    id: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<SalesReturnRefundEntity> {
    try {
      const updated = await this.salesReturnRepository.cancelRefund(
        id,
        actor.organizationId,
        expectedVersion,
        actor.userId,
      );
      await this.auditLogService.log({
        organizationId: actor.organizationId,
        userId: actor.userId,
        action: 'sales_return.refund.cancel',
        entityType: 'SalesReturnRefund',
        entityId: id,
        newValue: this.toAuditSnapshot(updated),
      });
      return updated;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private toAuditSnapshot(
    refund: SalesReturnRefundEntity,
  ): Record<string, unknown> {
    return {
      salesReturnId: refund.salesReturnId,
      amount: refund.amount,
      method: refund.method,
      status: refund.status,
    };
  }

  private toLifecycleEvent(
    refund: SalesReturnRefundEntity,
    salesReturnId: string,
    actor: ActorContext,
  ) {
    return {
      organizationId: actor.organizationId,
      userId: actor.userId,
      salesReturnId,
      refundId: refund.id,
      status: refund.status,
      amount: refund.amount,
      occurredAt: new Date(),
    };
  }

  private mapError(error: unknown): Error {
    if (error instanceof SalesReturnNotFoundError) {
      return new NotFoundException(
        withCode(ErrorCode.SALES_RETURN_NOT_FOUND, error.message),
      );
    }
    if (error instanceof SalesReturnNotReceivedForRefundError) {
      return new UnprocessableEntityException(
        withCode(ErrorCode.SALES_RETURN_NOT_RECEIVED_FOR_REFUND, error.message),
      );
    }
    if (error instanceof SalesReturnRefundAmountInvalidError) {
      return new UnprocessableEntityException(
        withCode(ErrorCode.SALES_RETURN_REFUND_AMOUNT_INVALID, error.message),
      );
    }
    if (error instanceof SalesReturnRefundNotFoundError) {
      return new NotFoundException(
        withCode(ErrorCode.SALES_RETURN_REFUND_NOT_FOUND, error.message),
      );
    }
    if (error instanceof SalesReturnRefundInvalidTransitionError) {
      return new UnprocessableEntityException(
        withCode(
          ErrorCode.SALES_RETURN_REFUND_INVALID_TRANSITION,
          error.message,
        ),
      );
    }
    if (error instanceof SalesReturnRefundVersionConflictError) {
      return new ConflictException(
        withCode(ErrorCode.SALES_RETURN_REFUND_VERSION_CONFLICT, error.message),
      );
    }
    return error as Error;
  }
}
