export type SalesReturnStatus =
  'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RECEIVED' | 'COMPLETED' | 'CANCELLED';

export type SalesReturnReason =
  | 'DAMAGED'
  | 'DEFECTIVE'
  | 'WRONG_PRODUCT'
  | 'CUSTOMER_CHANGED_MIND'
  | 'EXPIRED'
  | 'TRANSPORT_DAMAGE'
  | 'OTHER';

export type SalesReturnRefundStatus =
  'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type SalesReturnRefundMethod =
  'CASH' | 'BANK_TRANSFER' | 'CARD' | 'E_WALLET';

/**
 * Mandatory Snapshot tại thời điểm bán (mirror InvoiceItem Phase 5 pattern, SPEC-T014 §1).
 * `warehouseId` null hợp lệ nếu Product hiện là SERVICE tại thời điểm RECEIVED (SPEC §0.2/§12) —
 * `Product.type` KHÔNG được snapshot trên InvoiceItem, phải đọc lại qua ProductDomainService.
 */
export interface SalesReturnItemEntity {
  id: string;
  invoiceItemId: string;
  productId: string;
  warehouseId: string | null;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxAmount: string;
  totalAmount: string;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
  reason: SalesReturnReason;
  reasonNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Aggregate độc lập với SalesReturnStatus (Decision AD37/AD43) — không có trong SalesReturn
 * status, không bao giờ ghi vào bảng `payments` (Decision AD32).
 */
export interface SalesReturnRefundEntity {
  id: string;
  salesReturnId: string;
  amount: string;
  method: SalesReturnRefundMethod;
  status: SalesReturnRefundStatus;
  externalReference: string | null;
  failureReason: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Optimistic Lock riêng cho Refund transition, độc lập với SalesReturn.version. */
  version: number;
}

/**
 * Aggregate Root mới của T014 (Decision AD27/AD35) — tham chiếu trực tiếp Invoice/InvoiceItem,
 * KHÔNG dùng Order/OrderItem (scaffold cũ, không có write path thật).
 */
export interface SalesReturnEntity {
  id: string;
  organizationId: string;
  branchId: string;
  invoiceId: string;
  /** Denormalize từ Invoice.customerId để query nhanh — KHÔNG phải nguồn sự thật. */
  customerId: string | null;
  code: string;
  status: SalesReturnStatus;
  totalAmount: string;
  note: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Optimistic Lock (Decision AD41) — bảo vệ CHÍNH document này, KHÔNG phải cơ chế chống
   * over-return (đó là AD44 — InvoiceItem serialization trong SalesReturnRepository.receive()).
   */
  version: number;
  items: SalesReturnItemEntity[];
  refunds: SalesReturnRefundEntity[];
}
