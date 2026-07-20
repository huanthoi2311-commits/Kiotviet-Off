import { Prisma } from '@prisma/client';
import { CheckoutOperationEntity } from '../entities/checkout-operation.entity';

export interface CreateCheckoutOperationInput {
  organizationId: string;
  branchId: string;
  idempotencyKey: string;
  requestHash: string;
  createdBy: string | null;
}

/**
 * Cửa ngõ ghi/đọc DUY NHẤT của `CheckoutOperation` (SPEC-T013-SALES-FOUNDATION-001 §9.5, §13.2).
 * Không export ra ngoài module `checkout` — chỉ `CheckoutOperationService` được inject.
 */
export interface ICheckoutOperationRepository {
  findByKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<CheckoutOperationEntity | null>;

  /** INSERT mới (lần đầu tiên thấy key này) — 1 statement, tự atomic, không cần `tx`. */
  create(input: CreateCheckoutOperationInput): Promise<CheckoutOperationEntity>;

  /**
   * Compare-and-swap: chiếm lại 1 row đang `FAILED`, hoặc `PROCESSING` nhưng đã quá hạn "bị treo"
   * (`createdAt` cũ hơn `stuckThresholdMs`), đặt lại `PROCESSING` với `requestHash` mới và
   * `createdAt`/`expiresAt` mới. Trả về `null` nếu row không ở trạng thái có thể chiếm lại (đang
   * `PROCESSING` hợp lệ, hoặc đã `COMPLETED`, hoặc đã bị 1 request khác chiếm trước — race).
   */
  tryReclaim(
    id: string,
    requestHash: string,
    stuckThresholdMs: number,
    expiresAt: Date,
  ): Promise<CheckoutOperationEntity | null>;

  /** Bước cuối BÊN TRONG Business Transaction chính (SPEC §13.2) — cùng `tx` với Invoice/Payment. */
  markCompleted(
    id: string,
    invoiceId: string,
    paymentId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void>;

  /** Gọi NGOÀI transaction đã rollback (business error), hoặc bởi Cleanup Job cho row bị treo. */
  markFailed(id: string): Promise<void>;

  /** Dùng bởi Cleanup Job (Phase sau) — tìm row `PROCESSING` quá hạn `olderThanMs`. */
  findStuckProcessing(olderThanMs: number): Promise<CheckoutOperationEntity[]>;

  /** Dùng bởi Cleanup Job (Phase sau) — xóa row đã hết hạn (`COMPLETED`/`FAILED`, `expiresAt` quá khứ). */
  deleteExpired(): Promise<number>;
}

export const CHECKOUT_OPERATION_REPOSITORY = Symbol(
  'CHECKOUT_OPERATION_REPOSITORY',
);
