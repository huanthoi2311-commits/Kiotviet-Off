import { createHash } from 'crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { SalesReturnRefundOperationEntity } from '../domain/entities/sales-return-refund-operation.entity';
import { SalesReturnRefundOperationConflictError } from '../domain/errors/sales-return-refund-operation.errors';
import { SALES_RETURN_REFUND_OPERATION_REPOSITORY } from '../domain/repositories/sales-return-refund-operation.repository.interface';
import type { ISalesReturnRefundOperationRepository } from '../domain/repositories/sales-return-refund-operation.repository.interface';

/** Ngưỡng coi 1 row `PROCESSING` là "bị treo" — mirror `STUCK_THRESHOLD_MS` của Checkout (T013)/
 * Supplier Payment (T052.05B): không có ràng buộc kỹ thuật nào buộc phải khác (T053.06E Discovery
 * §17). */
const STUCK_THRESHOLD_MS = 2 * 60 * 1000; // 2 phút

export interface ReserveSalesReturnRefundOperationInput {
  organizationId: string;
  idempotencyKey: string;
  /** salesReturnId/amount/method/externalReference — dùng để tính requestFingerprint, không lưu
   * nguyên văn (T053.06E Discovery §10 — loại trừ timestamp/actor/session, mọi field business
   * còn lại đều đưa vào). */
  payload: Record<string, unknown>;
}

export type ReserveSalesReturnRefundOperationOutcome =
  { kind: 'NEW'; operationId: string } | { kind: 'REPLAY'; refundId: string };

/**
 * Business rule engine cho Idempotency của Sales Return Refund (T053.06E, thiết kế tại Discovery
 * Report T053.06E §8/§16). Cấu trúc state machine mirror `SupplierPaymentOperationService`
 * (T052.05B) — KHÔNG mirror `CheckoutOperationService` (T013): `requestFingerprint` là BẤT BIẾN
 * sau khi tạo. CAS reclaim (FAILED hoặc PROCESSING bị treo) với fingerprint KHÁC bị TỪ CHỐI (409
 * key-reused) thay vì ghi đè âm thầm như Checkout — dữ liệu tài chính cần khả năng đối soát ổn
 * định: 1 Idempotency-Key luôn đại diện cho ĐÚNG 1 ý định hoàn tiền bất biến.
 *
 * KHÔNG mở transaction riêng cho `reserve()`/`markFailed()` — mỗi thao tác trên
 * `ISalesReturnRefundOperationRepository` đã tự atomic (1 statement). `markCompleted()` nhận `tx`
 * từ caller (`PrismaSalesReturnRepository.createRefund()`) vì nó PHẢI nằm trong CÙNG Business
 * Transaction với SalesReturnRefund (đúng chuỗi transaction ở Discovery §16, giữ atomicity giữa
 * insert refund và đánh dấu operation hoàn tất).
 */
@Injectable()
export class SalesReturnRefundOperationService {
  constructor(
    @Inject(SALES_RETURN_REFUND_OPERATION_REPOSITORY)
    private readonly repository: ISalesReturnRefundOperationRepository,
  ) {}

  /**
   * Bước 1 — Reserve. Trả `NEW` nếu caller phải tiếp tục chạy Business Transaction; trả
   * `REPLAY` nếu đây là request trùng lặp đã thành công trước đó (không chạy lại logic nghiệp
   * vụ, không lock, không insert refund mới). Ném `ConflictException` (409) nếu key đã dùng với
   * payload khác (dù đang COMPLETED, FAILED, hay PROCESSING bị treo), hoặc đang có request khác
   * xử lý (PROCESSING còn hạn).
   */
  async reserve(
    input: ReserveSalesReturnRefundOperationInput,
  ): Promise<ReserveSalesReturnRefundOperationOutcome> {
    const fingerprint = this.hashPayload(input.payload);
    const existing = await this.repository.findByKey(
      input.organizationId,
      input.idempotencyKey,
    );

    if (!existing) {
      try {
        const created = await this.repository.create({
          organizationId: input.organizationId,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: fingerprint,
        });
        return { kind: 'NEW', operationId: created.id };
      } catch (error) {
        if (error instanceof SalesReturnRefundOperationConflictError) {
          // Thua race — 1 request đồng thời khác vừa insert trước (unique constraint chặn).
          throw this.activeConflict();
        }
        throw error;
      }
    }

    if (existing.status === 'COMPLETED') {
      if (existing.requestFingerprint !== fingerprint) {
        throw this.keyReusedConflict();
      }
      return { kind: 'REPLAY', refundId: existing.refundId as string };
    }

    const isStaleProcessing =
      existing.status === 'PROCESSING' && this.isStuck(existing);
    if (existing.status === 'PROCESSING' && !isStaleProcessing) {
      throw this.activeConflict();
    }

    // FAILED, hoặc PROCESSING bị treo — fingerprint BẤT BIẾN, kiểm tra TRƯỚC khi CAS. Không bao
    // giờ chiếm lại 1 row với payload khác dưới cùng 1 key; client phải sinh Idempotency-Key MỚI.
    if (existing.requestFingerprint !== fingerprint) {
      throw this.keyReusedConflict();
    }

    const reclaimed = await this.repository.tryReclaim(
      existing.id,
      fingerprint,
      STUCK_THRESHOLD_MS,
    );
    if (!reclaimed) {
      // Thua race — 1 request khác vừa chiếm lại row này trước (cùng fingerprint).
      throw this.activeConflict();
    }
    return { kind: 'NEW', operationId: reclaimed.id };
  }

  /** Bước cuối BÊN TRONG Business Transaction chính — gọi ngay trước khi transaction commit. */
  markCompleted(
    operationId: string,
    refundId: string,
    tx: Parameters<ISalesReturnRefundOperationRepository['markCompleted']>[2],
  ): Promise<void> {
    return this.repository.markCompleted(operationId, refundId, tx);
  }

  /** Gọi NGOÀI transaction đã rollback (lỗi nghiệp vụ, vd vượt cap) — cho phép retry ngay (chỉ
   * gọi cho request đang giữ quyền sở hữu NEW — không bao giờ gọi cho REPLAY hoặc request thua
   * conflict, đảm bảo bởi caller: chỉ nằm trong nhánh `kind === 'NEW'`). */
  markFailed(operationId: string): Promise<void> {
    return this.repository.markFailed(operationId);
  }

  private isStuck(operation: SalesReturnRefundOperationEntity): boolean {
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
        ErrorCode.SALES_RETURN_REFUND_IDEMPOTENCY_KEY_REUSED,
        'Idempotency-Key này đã dùng cho một yêu cầu khác với dữ liệu khác',
      ),
    );
  }

  private activeConflict(): ConflictException {
    return new ConflictException(
      withCode(
        ErrorCode.SALES_RETURN_REFUND_IDEMPOTENCY_CONFLICT,
        'Yêu cầu với Idempotency-Key này đang được xử lý, vui lòng thử lại sau',
      ),
    );
  }
}
