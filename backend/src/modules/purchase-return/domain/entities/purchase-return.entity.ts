export type PurchaseReturnStatus =
  'DRAFT' | 'APPROVED' | 'COMPLETED' | 'CANCELLED';

export type PurchaseReturnReason =
  'DAMAGED' | 'WRONG_PRODUCT' | 'EXPIRED' | 'OTHER';

export interface PurchaseReturnItemEntity {
  id: string;
  purchaseItemId: string;
  productId: string;
  warehouseId: string;
  quantity: string;
  unitCost: string;
  totalAmount: string;
}

export interface PurchaseReturnEntity {
  id: string;
  organizationId: string;
  purchaseOrderId: string;
  supplierId: string;
  code: string;
  status: PurchaseReturnStatus;
  reason: PurchaseReturnReason;
  totalAmount: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  items: PurchaseReturnItemEntity[];
}
