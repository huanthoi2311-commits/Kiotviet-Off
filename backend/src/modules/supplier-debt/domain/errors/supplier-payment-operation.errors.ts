/**
 * Lỗi domain cho `SupplierPaymentOperation` (T052.05B). Tách khỏi
 * `supplier-payment-operation.repository.interface.ts` để tầng Application
 * (`SupplierPaymentOperationService`) import được bằng `instanceof` — đúng mẫu
 * `CheckoutOperationConflictError`.
 */

/**
 * Ném khi 2 request đồng thời cùng `(organizationId, idempotencyKey)` cùng thấy "chưa tồn tại"
 * và cùng gọi `create()` — unique constraint DB-level chặn 1 trong 2 (P2002). Bằng chứng trực
 * tiếp cho yêu cầu "Concurrent requests → Exactly one operation succeeds" (T052.05A.1 §2).
 */
export class SupplierPaymentOperationConflictError extends Error {
  constructor(public readonly idempotencyKey: string) {
    super(
      `Idempotency-Key "${idempotencyKey}" vừa được một giao dịch khác chiếm giữ đồng thời`,
    );
  }
}
