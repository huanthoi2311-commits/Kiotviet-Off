/**
 * PENDING và COMPLETED được khai báo theo đúng danh sách Status của Prompt 027 nhưng
 * không được set bởi bất kỳ endpoint nào trong module này (API list của Prompt 027 chỉ
 * có create/approve/receive/cancel — không có submit/complete). PENDING dự phòng cho một
 * bước "gửi duyệt" trong tương lai; COMPLETED dự kiến sẽ được set khi công nợ đơn nhập đã
 * thanh toán đủ (Prompt 029 — Supplier Debt/Payment), không thuộc phạm vi Prompt 027.
 */
export type PurchaseOrderStatus =
  'DRAFT' | 'PENDING' | 'APPROVED' | 'RECEIVED' | 'COMPLETED' | 'CANCELLED';

export interface PurchaseItemEntity {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: string;
  receivedQuantity: string;
  unitCost: string;
  discount: string;
  taxAmount: string;
  totalAmount: string;
}

export interface PurchaseOrderEntity {
  id: string;
  organizationId: string;
  branchId: string;
  supplierId: string;
  code: string;
  status: PurchaseOrderStatus;
  totalAmount: string;
  paidAmount: string;
  expectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  items: PurchaseItemEntity[];
}
