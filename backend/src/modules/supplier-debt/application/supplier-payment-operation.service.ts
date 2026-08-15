import { createHash } from 'crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { SupplierPaymentOperationEntity } from '../domain/entities/supplier-payment-operation.entity';
import { SupplierPaymentOperationConflictError } from '../domain/errors/supplier-payment-operation.errors';
import { SUPPLIER_PAYMENT_OPERATION_REPOSITORY } from '../domain/repositories/supplier-payment-operation.repository.interface';
import type { ISupplierPaymentOperationRepository } from '../domain/repositories/supplier-payment-operation.repository.interface';

/** Ngưỡng coi 1 row `PROCESSING` là "bị treo" — mirror `STUCK_THRESHOLD_MS` của Checkout (T013),
 * theo Architect Decision D10 (T052.05B): không có ràng buộc kỹ thuật nào buộc phải khác. */
const STUCK_THRESHOLD_MS = 2 * 60 * 1000; // 2 phút

export interface ReserveSupplierPaymentOperationInput {
  organizationId: string;
  idempotencyKey: string;
  /** Toàn bộ CreateSupplierPaymentDto (đã validate) — dùng để tính requestFingerprint, không
   * lưu nguyên văn (T052.05A.1 §7/§8 — mọi field đều do client kiểm soát, không có field nào
   * không xác định cần loại trừ). */
  payload: Record<string, unknown>;
}

export type ReserveSupplierPaymentOperationOutcome =
  { kind: 'NEW'; operationId: string } | { kind: 'REPLAY'; paymentId: string };

/**
 * Business rule engine cho Idempotency của Supplier Payment (T052.05B, thiết kế tại
 * T052.05A/T052.05A.1). Cấu trúc state machine mirror `CheckoutOperationService` (T013) —
 * NHƯNG với 1 khác biệt CHỦ Ý (T052.05A.1 §9, quyết định Kiến trúc sư): `requestFingerprint`
 * là BẤT BIẾN sau khi tạo. CAS reclaim (FAILED hoặc PROCESSING bị treo) với fingerprint KHÁC
 * bị TỪ CHỐI (409 key-reused) thay vì ghi đè âm thầm như Checkout — dữ liệu tài chính cần khả
 * năng đối soát ổn định: 1 Idempotency-Key luôn đại diện cho ĐÚNG 1 ý định thanh toán bất biến.
 *
 * KHÔNG mở transaction riêng cho `reserve()`/`markFailed()` — mỗi thao tác trên
 * `ISupplierPaymentOperationRepository` đã tự atomic (1 statement). `markCompleted()` nhận `tx`
 * từ caller (`PrismaSupplierDebtRepository.createPayment()`) vì nó PHẢI nằm trong CÙNG Business
 * Transaction với Payment (T052.05A.1 §3 atomicity proof).
 */
@Injectable()
export class SupplierPaymentOperationService {
  constructor(
    @Inject(SUPPLIER_PAYMENT_OPERATION_REPOSITORY)
    private readonly repository: ISupplierPaymentOperationRepository,
  ) {}

  /**
   * Bước 1 — Reserve. Trả `NEW` nếu caller phải tiếp tục chạy Business Transaction; trả
   * `REPLAY` nếu đây là request trùng lặp đã thành công trước đó (không chạy lại logic nghiệp
   * vụ, không advisory lock, không Payment insert — D6/§6 của T052.05B). Ném `ConflictException`
   * (409) nếu key đã dùng với payload khác (dù đang COMPLETED, FAILED, hay PROCESSING bị treo),
   * hoặc đang có request khác xử lý (PROCESSING còn hạn).
   */
  async reserve(
    input: ReserveSupplierPaymentOperationInput,
  ): Promise<ReserveSupplierPaymentOperationOutcome> {
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
        if (error instanceof SupplierPaymentOperationConflictError) {
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
      return { kind: 'REPLAY', paymentId: existing.paymentId as string };
    }

    const isStaleProcessing =
      existing.status === 'PROCESSING' && this.isStuck(existing);
    if (existing.status === 'PROCESSING' && !isStaleProcessing) {
      throw this.activeConflict();
    }

    // FAILED, hoặc PROCESSING bị treo — T052.05A.1 §9: fingerprint BẤT BIẾN, kiểm tra TRƯỚC
    // khi CAS. Khác CheckoutOperation (fall-through, ghi đè âm thầm) — không bao giờ chiếm lại
    // 1 row với payload khác dưới cùng 1 key; client phải sinh Idempotency-Key MỚI.
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
    paymentId: string,
    tx: Parameters<ISupplierPaymentOperationRepository['markCompleted']>[2],
  ): Promise<void> {
    return this.repository.markCompleted(operationId, paymentId, tx);
  }

  /** Gọi NGOÀI transaction đã rollback (lỗi nghiệp vụ) — cho phép retry ngay (D9: chỉ gọi cho
   * request đang giữ quyền sở hữu NEW — không bao giờ gọi cho REPLAY hoặc request thua conflict,
   * đảm bảo bởi caller: chỉ nằm trong nhánh `kind === 'NEW'`). */
  markFailed(operationId: string): Promise<void> {
    return this.repository.markFailed(operationId);
  }

  private isStuck(operation: SupplierPaymentOperationEntity): boolean {
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
        ErrorCode.SUPPLIER_PAYMENT_IDEMPOTENCY_KEY_REUSED,
        'Idempotency-Key này đã dùng cho một yêu cầu khác với dữ liệu khác',
      ),
    );
  }

  private activeConflict(): ConflictException {
    return new ConflictException(
      withCode(
        ErrorCode.SUPPLIER_PAYMENT_IDEMPOTENCY_CONFLICT,
        'Yêu cầu với Idempotency-Key này đang được xử lý, vui lòng thử lại sau',
      ),
    );
  }
}
