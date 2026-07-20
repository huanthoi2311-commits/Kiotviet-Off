export type CheckoutOperationStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * Ho tro Idempotency cho POST /checkout (T013, SPEC-T013-SALES-FOUNDATION-001 §13) — tach biet
 * hoan toan khoi Invoice/Payment de "reserve" 1 Idempotency-Key co the durable/quan sat duoc
 * TRUOC khi Business Transaction chinh tao Invoice. Khong phai aggregate nghiep vu.
 */
export interface CheckoutOperationEntity {
  id: string;
  organizationId: string;
  branchId: string;
  idempotencyKey: string;
  requestHash: string;
  status: CheckoutOperationStatus;
  invoiceId: string | null;
  paymentId: string | null;
  createdBy: string | null;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
}
