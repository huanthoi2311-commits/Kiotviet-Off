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

export interface CreateRefundParams {
  salesReturnId: string;
  amount: number;
  method: 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'E_WALLET';
  externalReference?: string | null;
}

const ACTIVE_REFUND_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED'];
const RECEIVABLE_STATUSES_FOR_REFUND = ['RECEIVED', 'COMPLETED'];

/**
 * T014 Phase 4 (RFC-T014 v1.1 §20/§23, SPEC §15, Decision AD37/AD43) — Refund là aggregate hoàn
 * toàn độc lập với SalesReturn.status, sở hữu bởi SalesReturn nhưng KHÔNG BAO GIỜ ghi vào bảng
 * `payments` (Decision AD32). Mỗi phương thức repository refund là 1 statement/transaction đơn
 * (không cần `$transaction()` tường minh — atomic tự nhiên), tách biệt hoàn toàn với transaction
 * `receive()` của SalesReturn (Phase 3).
 */
@Injectable()
export class RefundDomainService {
  constructor(
    @Inject(SALES_RETURN_REPOSITORY)
    private readonly salesReturnRepository: ISalesReturnRepository,
    private readonly auditLogService: AuditLogService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  async createRefund(
    params: CreateRefundParams,
    actor: ActorContext,
  ): Promise<SalesReturnRefundEntity> {
    const salesReturn = await this.salesReturnRepository.findById(
      params.salesReturnId,
      actor.organizationId,
    );
    if (!salesReturn) {
      throw this.mapError(new SalesReturnNotFoundError(params.salesReturnId));
    }
    if (!RECEIVABLE_STATUSES_FOR_REFUND.includes(salesReturn.status)) {
      throw this.mapError(
        new SalesReturnNotReceivedForRefundError(
          salesReturn.id,
          salesReturn.status,
        ),
      );
    }
    if (params.amount <= 0) {
      throw this.mapError(
        new SalesReturnRefundAmountInvalidError(params.amount.toString()),
      );
    }

    const activeRefundTotal = salesReturn.refunds
      .filter((refund) => ACTIVE_REFUND_STATUSES.includes(refund.status))
      .reduce((sum, refund) => sum + Number(refund.amount), 0);
    if (activeRefundTotal + params.amount > Number(salesReturn.totalAmount)) {
      throw this.mapError(
        new SalesReturnRefundAmountInvalidError(params.amount.toString()),
      );
    }

    const created = await this.salesReturnRepository.createRefund({
      salesReturnId: params.salesReturnId,
      amount: params.amount,
      method: params.method,
      externalReference: params.externalReference ?? null,
      createdBy: actor.userId,
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
