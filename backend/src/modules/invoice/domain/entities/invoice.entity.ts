export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';

export interface InvoiceItemEntity {
  id: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxAmount: string;
  totalAmount: string;
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
  createdAt: Date;
  updatedAt: Date;
  items: InvoiceItemEntity[];
}
