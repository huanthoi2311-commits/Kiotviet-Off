export type SalesReturnRefundOperationStatus =
  'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * Hỗ trợ Idempotency cho POST /sales-returns/:id/refunds (T053.06E, thiết kế tại Discovery Report
 * T053.06E) — tách biệt hoàn toàn khỏi SalesReturnRefund để "reserve" 1 Idempotency-Key có thể
 * durable/quan sát được TRƯỚC khi Business Transaction chính tạo SalesReturnRefund. Không phải
 * aggregate nghiệp vụ.
 *
 * Mirror SupplierPaymentOperationEntity (T052.05B), KHÔNG mirror CheckoutOperationEntity (T013):
 * `requestFingerprint` là BẤT BIẾN sau khi tạo — không bao giờ bị ghi đè bởi CAS reclaim
 * (`SalesReturnRefundOperationService.reserve()`) — dữ liệu tài chính cần khả năng đối soát ổn
 * định hơn UX bán hàng liên tục của Checkout (cùng lý do đã áp dụng cho Supplier Payment).
 */
export interface SalesReturnRefundOperationEntity {
  id: string;
  organizationId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  status: SalesReturnRefundOperationStatus;
  refundId: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}
