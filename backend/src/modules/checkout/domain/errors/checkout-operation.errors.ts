/**
 * Lỗi domain cho `CheckoutOperation` (T013, SPEC-T013-SALES-FOUNDATION-001 §13). Tách khỏi
 * `checkout-operation.repository.interface.ts` để tầng Application (`CheckoutOperationService`)
 * import được bằng `instanceof` — đúng mẫu `SupplierConcurrencyConflictError`/
 * `InventoryConcurrencyConflictError`.
 */

/**
 * Ném khi 2 request đồng thời cùng `(organizationId, idempotencyKey)` cùng thấy "chưa tồn tại"
 * và cùng gọi `create()` — unique constraint DB-level chặn 1 trong 2 (P2002). Đây là bằng chứng
 * trực tiếp cho yêu cầu "Concurrent requests → Exactly one operation succeeds".
 */
export class CheckoutOperationConflictError extends Error {
  constructor(public readonly idempotencyKey: string) {
    super(
      `Idempotency-Key "${idempotencyKey}" vừa được một giao dịch khác chiếm giữ đồng thời`,
    );
  }
}
