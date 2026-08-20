import { Prisma } from '@prisma/client';
import { SalesReturnRefundOperationEntity } from '../entities/sales-return-refund-operation.entity';

export interface CreateSalesReturnRefundOperationInput {
  organizationId: string;
  idempotencyKey: string;
  requestFingerprint: string;
}

/**
 * Cửa ngõ ghi/đọc DUY NHẤT của `SalesReturnRefundOperation` (T053.06E). Không export ra ngoài
 * module `sales-return` — chỉ `SalesReturnRefundOperationService` và `PrismaSalesReturnRepository`
 * (để gọi `markCompleted()` trong CÙNG transaction với `SalesReturnRefund.create()`, cùng module,
 * mirror `PrismaSupplierDebtRepository`/T052.05A.1 §3) được inject.
 */
export interface ISalesReturnRefundOperationRepository {
  findByKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<SalesReturnRefundOperationEntity | null>;

  /** INSERT mới (lần đầu tiên thấy key này) — 1 statement, tự atomic, không cần `tx`. */
  create(
    input: CreateSalesReturnRefundOperationInput,
  ): Promise<SalesReturnRefundOperationEntity>;

  /**
   * Compare-and-swap: chiếm lại 1 row đang `FAILED`, hoặc `PROCESSING` nhưng đã quá hạn "bị
   * treo" (`createdAt` cũ hơn `stuckThresholdMs`), đặt lại `PROCESSING` với `createdAt` mới.
   *
   * `requestFingerprint` KHÔNG bao giờ được ghi trong `data` — cột này bất biến sau khi tạo
   * (mirror T052.05A.1 §9). `requestFingerprint` tham số ở đây chỉ dùng làm điều kiện `WHERE`
   * (khớp với giá trị đã lưu) — lớp phòng thủ DB-level thứ hai bên cạnh so sánh ở tầng Service
   * (`SalesReturnRefundOperationService.reserve()` đã từ chối 409 TRƯỚC khi gọi hàm này nếu
   * fingerprint khác).
   *
   * Trả về `null` nếu row không ở trạng thái có thể chiếm lại (đang `PROCESSING` hợp lệ, đã
   * `COMPLETED`, fingerprint không khớp, hoặc đã bị 1 request khác chiếm trước — race).
   */
  tryReclaim(
    id: string,
    requestFingerprint: string,
    stuckThresholdMs: number,
  ): Promise<SalesReturnRefundOperationEntity | null>;

  /** Bước cuối BÊN TRONG Business Transaction chính của `PrismaSalesReturnRepository.createRefund()`
   * — cùng `tx` với `SalesReturnRefund.create()`. */
  markCompleted(
    id: string,
    refundId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void>;

  /** Gọi NGOÀI transaction đã rollback (business error) — chỉ bởi request đang giữ quyền sở
   * hữu `NEW` (không bao giờ gọi cho REPLAY hoặc request thua conflict). */
  markFailed(id: string): Promise<void>;
}

export const SALES_RETURN_REFUND_OPERATION_REPOSITORY = Symbol(
  'SALES_RETURN_REFUND_OPERATION_REPOSITORY',
);
