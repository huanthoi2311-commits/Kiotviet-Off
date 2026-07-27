/** SPEC-T014-SALES-RETURN-EXCHANGE-001 §11, RFC-T014 v1.1 §26 — publish SAU khi commit. */

export const SALES_RETURN_CREATED_EVENT = 'sales_return.created';
export const SALES_RETURN_SUBMITTED_EVENT = 'sales_return.submitted';
export const SALES_RETURN_APPROVED_EVENT = 'sales_return.approved';
export const SALES_RETURN_RECEIVED_EVENT = 'sales_return.received';
export const INVENTORY_RESTORED_EVENT = 'sales_return.inventory_restored';
export const SALES_RETURN_COMPLETED_EVENT = 'sales_return.completed';
export const SALES_RETURN_CANCELLED_EVENT = 'sales_return.cancelled';

/** Phase 4 — RFC-T014 v1.1 §26 danh sách tối thiểu (không có Processing/Cancelled riêng). */
export const SALES_RETURN_REFUND_CREATED_EVENT = 'sales_return.refund_created';
export const SALES_RETURN_REFUND_COMPLETED_EVENT =
  'sales_return.refund_completed';
export const SALES_RETURN_REFUND_FAILED_EVENT = 'sales_return.refund_failed';

export interface SalesReturnLifecycleEvent {
  organizationId: string;
  userId: string;
  salesReturnId: string;
  invoiceId: string;
  status: string;
  occurredAt: Date;
}

export interface SalesReturnRefundLifecycleEvent {
  organizationId: string;
  userId: string;
  salesReturnId: string;
  refundId: string;
  status: string;
  amount: string;
  occurredAt: Date;
}

export interface InventoryRestoredEvent {
  organizationId: string;
  userId: string;
  salesReturnId: string;
  productId: string;
  warehouseId: string;
  quantity: string;
  occurredAt: Date;
}
