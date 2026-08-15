export type SupplierPaymentOperationStatus =
  'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * Hỗ trợ Idempotency cho POST /supplier-payment (T052.05B, thiết kế tại T052.05A/T052.05A.1) —
 * tách biệt hoàn toàn khỏi Payment để "reserve" 1 Idempotency-Key có thể durable/quan sát được
 * TRƯỚC khi Business Transaction chính tạo Payment. Không phải aggregate nghiệp vụ.
 *
 * Khác `CheckoutOperationEntity` (T013): `requestFingerprint` là BẤT BIẾN sau khi tạo — không
 * bao giờ bị ghi đè bởi CAS reclaim (`SupplierPaymentOperationService.reserve()`), theo quyết
 * định Kiến trúc sư tại T052.05A.1 §9 (dữ liệu tài chính cần khả năng đối soát ổn định hơn UX
 * bán hàng liên tục của Checkout).
 */
export interface SupplierPaymentOperationEntity {
  id: string;
  organizationId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  status: SupplierPaymentOperationStatus;
  paymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}
