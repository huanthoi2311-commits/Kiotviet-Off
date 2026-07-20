import { createHash } from 'crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { CheckoutOperationEntity } from '../domain/entities/checkout-operation.entity';
import { CheckoutOperationConflictError } from '../domain/errors/checkout-operation.errors';
import { CHECKOUT_OPERATION_REPOSITORY } from '../domain/repositories/checkout-operation.repository.interface';
import type { ICheckoutOperationRepository } from '../domain/repositories/checkout-operation.repository.interface';

/** Ngưỡng coi 1 row `PROCESSING` là "bị treo" (crash server giữa Business Transaction) — SPEC §3.3. */
const STUCK_THRESHOLD_MS = 2 * 60 * 1000; // 2 phút
const RETENTION_MS = 48 * 60 * 60 * 1000; // 48h

export interface ReserveCheckoutOperationInput {
  organizationId: string;
  branchId: string;
  idempotencyKey: string;
  /** Payload nghiệp vụ đã chuẩn hóa (vd CheckoutDto) — dùng để tính requestHash, không lưu nguyên văn. */
  payload: Record<string, unknown>;
  createdBy: string | null;
}

export type ReserveCheckoutOperationOutcome =
  | { kind: 'NEW'; operationId: string }
  | { kind: 'REPLAY'; invoiceId: string; paymentId: string };

/**
 * Business rule engine cho Idempotency (SPEC-T013-SALES-FOUNDATION-001 §13.2, Retry Policy).
 * KHÔNG mở transaction riêng cho `reserve()`/`markFailed()` — mỗi thao tác trên
 * `ICheckoutOperationRepository` đã tự atomic (1 statement). `markCompleted()` nhận `tx` từ
 * caller vì nó PHẢI nằm trong CÙNG Business Transaction với Invoice/Payment (SPEC §14).
 */
@Injectable()
export class CheckoutOperationService {
  constructor(
    @Inject(CHECKOUT_OPERATION_REPOSITORY)
    private readonly repository: ICheckoutOperationRepository,
  ) {}

  /**
   * Bước 1 — Reserve (SPEC §13.2). Trả `NEW` nếu caller phải tiếp tục chạy Business Transaction;
   * trả `REPLAY` nếu đây là request trùng lặp đã thành công trước đó (không chạy lại logic).
   * Ném `ConflictException` (409) nếu key đã dùng với payload khác, hoặc đang có request khác
   * xử lý (PROCESSING còn hạn).
   */
  async reserve(
    input: ReserveCheckoutOperationInput,
  ): Promise<ReserveCheckoutOperationOutcome> {
    const requestHash = this.hashPayload(input.payload);
    const existing = await this.repository.findByKey(
      input.organizationId,
      input.idempotencyKey,
    );

    if (!existing) {
      try {
        const created = await this.repository.create({
          organizationId: input.organizationId,
          branchId: input.branchId,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          createdBy: input.createdBy,
        });
        return { kind: 'NEW', operationId: created.id };
      } catch (error) {
        if (error instanceof CheckoutOperationConflictError) {
          // Thua race — 1 request đồng thời khác vừa insert trước (unique constraint chặn).
          throw this.activeConflict();
        }
        throw error;
      }
    }

    if (existing.status === 'COMPLETED') {
      if (existing.requestHash !== requestHash) {
        throw this.keyReusedConflict();
      }
      return {
        kind: 'REPLAY',
        invoiceId: existing.invoiceId as string,
        paymentId: existing.paymentId as string,
      };
    }

    if (existing.status === 'PROCESSING' && !this.isStuck(existing)) {
      throw this.activeConflict();
    }

    // FAILED, hoặc PROCESSING nhưng đã bị treo quá STUCK_THRESHOLD_MS — cho phép chiếm lại.
    const reclaimed = await this.repository.tryReclaim(
      existing.id,
      requestHash,
      STUCK_THRESHOLD_MS,
      new Date(Date.now() + RETENTION_MS),
    );
    if (!reclaimed) {
      // Thua race — 1 request khác vừa chiếm lại row này trước.
      throw this.activeConflict();
    }
    return { kind: 'NEW', operationId: reclaimed.id };
  }

  /** Bước cuối BÊN TRONG Business Transaction chính — gọi ngay trước khi transaction commit. */
  markCompleted(
    operationId: string,
    invoiceId: string,
    paymentId: string,
    tx: Parameters<ICheckoutOperationRepository['markCompleted']>[3],
  ): Promise<void> {
    return this.repository.markCompleted(operationId, invoiceId, paymentId, tx);
  }

  /** Gọi NGOÀI transaction đã rollback (lỗi nghiệp vụ, vd hết tồn kho) — cho phép retry ngay. */
  markFailed(operationId: string): Promise<void> {
    return this.repository.markFailed(operationId);
  }

  private isStuck(operation: CheckoutOperationEntity): boolean {
    return Date.now() - operation.createdAt.getTime() >= STUCK_THRESHOLD_MS;
  }

  private hashPayload(payload: Record<string, unknown>): string {
    const normalized = JSON.stringify(this.sortKeysDeep(payload));
    return createHash('sha256').update(normalized).digest('hex');
  }

  /** Sắp xếp key đệ quy ở mọi cấp — {a:1,b:2} và {b:2,a:1} phải cho cùng 1 hash. */
  private sortKeysDeep(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortKeysDeep(item));
    }
    if (value !== null && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = this.sortKeysDeep((value as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }
    return value;
  }

  private keyReusedConflict(): ConflictException {
    return new ConflictException(
      withCode(
        ErrorCode.CHECKOUT_IDEMPOTENCY_KEY_REUSED,
        'Idempotency-Key này đã dùng cho một yêu cầu khác với dữ liệu khác',
      ),
    );
  }

  private activeConflict(): ConflictException {
    return new ConflictException(
      withCode(
        ErrorCode.CHECKOUT_IDEMPOTENCY_CONFLICT,
        'Yêu cầu với Idempotency-Key này đang được xử lý, vui lòng thử lại sau',
      ),
    );
  }
}
