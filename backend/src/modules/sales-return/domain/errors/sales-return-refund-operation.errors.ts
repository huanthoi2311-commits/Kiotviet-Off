/**
 * Lỗi domain cho `SalesReturnRefundOperation` (T053.06E). Tách khỏi
 * `sales-return-refund-operation.repository.interface.ts` để tầng Application
 * (`SalesReturnRefundOperationService`) import được bằng `instanceof` — đúng mẫu
 * `SupplierPaymentOperationConflictError`/`CheckoutOperationConflictError`.
 */

/**
 * Ném khi 2 request đồng thời cùng `(organizationId, idempotencyKey)` cùng thấy "chưa tồn tại"
 * và cùng gọi `create()` — unique constraint DB-level chặn 1 trong 2 (P2002). Bằng chứng trực
 * tiếp cho "Concurrent requests với cùng key → Exactly one operation succeeds".
 */
export class SalesReturnRefundOperationConflictError extends Error {
  constructor(public readonly idempotencyKey: string) {
    super(
      `Idempotency-Key "${idempotencyKey}" vừa được một giao dịch khác chiếm giữ đồng thời`,
    );
  }
}
