export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';

export interface InvoiceItemEntity {
  id: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxAmount: string;
  totalAmount: string;
  /**
   * Mandatory Snapshot (SPEC-T013-SALES-FOUNDATION-001 §1.3, Decision SP07) — Checkout luôn ghi
   * giá trị cho Invoice MỚI. Kiểu vẫn `string | null` vì cột nullable ở DB và Invoice tạo TRƯỚC
   * Phase 5 hợp lệ có giá trị null (không backfill lịch sử).
   */
  productCodeSnapshot: string | null;
  productNameSnapshot: string | null;
  unitNameSnapshot: string | null;
  /** Conditional Snapshot — null nếu dòng hàng không gắn Barcode cụ thể. */
  barcodeId: string | null;
  barcodeSnapshot: string | null;
}

/**
 * `orderId` luôn null ở Prompt 035 — Checkout Engine tạo Invoice trực tiếp từ Cart, không
 * qua Order (Order Module chưa xây, Volume 036-040). Field vẫn khai đủ để tương thích khi
 * Order Module xây xong có thể gắn ngược mà không cần đổi shape Invoice.
 */
export interface InvoiceEntity {
  id: string;
  organizationId: string;
  branchId: string;
  orderId: string | null;
  customerId: string | null;
  code: string;
  status: InvoiceStatus;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  dueDate: Date | null;
  /** Mandatory Snapshot (SPEC-T013-SALES-FOUNDATION-001 §1.3) — null nếu Invoice không gắn Customer. */
  customerCodeSnapshot: string | null;
  customerNameSnapshot: string | null;
  customerPhoneSnapshot: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: InvoiceItemEntity[];
}
