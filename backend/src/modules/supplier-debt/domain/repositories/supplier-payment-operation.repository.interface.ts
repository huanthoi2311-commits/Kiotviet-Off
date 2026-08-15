import { Prisma } from '@prisma/client';
import { SupplierPaymentOperationEntity } from '../entities/supplier-payment-operation.entity';

export interface CreateSupplierPaymentOperationInput {
  organizationId: string;
  idempotencyKey: string;
  requestFingerprint: string;
}

/**
 * Cửa ngõ ghi/đọc DUY NHẤT của `SupplierPaymentOperation` (T052.05B). Không export ra ngoài
 * module `supplier-debt` — chỉ `SupplierPaymentOperationService` và `PrismaSupplierDebtRepository`
 * (để gọi `markCompleted()` trong CÙNG transaction với `Payment.create()`, T052.05A.1 §3) được
 * inject.
 */
export interface ISupplierPaymentOperationRepository {
  findByKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<SupplierPaymentOperationEntity | null>;

  /** INSERT mới (lần đầu tiên thấy key này) — 1 statement, tự atomic, không cần `tx`. */
  create(
    input: CreateSupplierPaymentOperationInput,
  ): Promise<SupplierPaymentOperationEntity>;

  /**
   * Compare-and-swap: chiếm lại 1 row đang `FAILED`, hoặc `PROCESSING` nhưng đã quá hạn "bị
   * treo" (`createdAt` cũ hơn `stuckThresholdMs`), đặt lại `PROCESSING` với `createdAt` mới.
   *
   * KHÁC `tryReclaim()` của interface tương đương bên Checkout (T013): `requestFingerprint`
   * KHÔNG bao giờ được ghi trong `data` — cột này bất biến sau khi tạo (T052.05A.1 §9). `requestFingerprint`
   * tham số ở đây chỉ dùng làm điều kiện `WHERE` (khớp với giá trị đã lưu) — một lớp phòng thủ
   * DB-level thứ hai bên cạnh so sánh ở tầng Service (`SupplierPaymentOperationService.reserve()`
   * đã từ chối 409 TRƯỚC khi gọi hàm này nếu fingerprint khác — hàm này không bao giờ được gọi
   * với fingerprint không khớp trong luồng bình thường, tham số tồn tại để CAS không thể vô tình
   * chiếm lại 1 row có fingerprint khác dù có sửa đổi tương lai ở tầng Service).
   *
   * Trả về `null` nếu row không ở trạng thái có thể chiếm lại (đang `PROCESSING` hợp lệ, đã
   * `COMPLETED`, fingerprint không khớp, hoặc đã bị 1 request khác chiếm trước — race).
   */
  tryReclaim(
    id: string,
    requestFingerprint: string,
    stuckThresholdMs: number,
  ): Promise<SupplierPaymentOperationEntity | null>;

  /** Bước cuối BÊN TRONG Business Transaction chính của `PrismaSupplierDebtRepository.createPayment()`
   * (T052.05A.1 §3 atomicity proof) — cùng `tx` với `Payment.create()`. */
  markCompleted(
    id: string,
    paymentId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void>;

  /** Gọi NGOÀI transaction đã rollback (business error) — chỉ bởi request đang giữ quyền sở
   * hữu `NEW` (D9, không bao giờ gọi cho REPLAY hoặc request thua conflict). */
  markFailed(id: string): Promise<void>;
}

export const SUPPLIER_PAYMENT_OPERATION_REPOSITORY = Symbol(
  'SUPPLIER_PAYMENT_OPERATION_REPOSITORY',
);
