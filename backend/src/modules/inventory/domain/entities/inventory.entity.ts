export type InventoryMovementType =
  | 'PURCHASE'
  | 'SALE'
  | 'RETURN'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'ADJUSTMENT'
  | 'COUNT'
  | 'DAMAGE'
  | 'INITIAL';

export type InventoryReferenceType =
  'PURCHASE' | 'POS' | 'TRANSFER' | 'COUNT' | 'RETURN' | 'SYSTEM';

/** Snapshot đọc nhanh — không bao giờ được set trực tiếp, chỉ qua InventoryDomainService. */
export interface InventoryEntity {
  id: string;
  organizationId: string;
  warehouseId: string;
  productId: string;
  quantity: string;
  reservedQty: string;
  /** Tính = quantity - reservedQty, không lưu trong DB (tránh lệch dữ liệu). */
  availableQty: string;
  avgCost: string;
  lastCost: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Một dòng trong ledger bất biến — không có updatedAt vì không bao giờ bị sửa sau khi ghi. */
export interface InventoryMovementEntity {
  id: string;
  organizationId: string;
  warehouseId: string;
  productId: string;
  movementType: InventoryMovementType;
  referenceType: InventoryReferenceType;
  referenceId: string | null;
  quantity: string;
  beforeQuantity: string;
  afterQuantity: string;
  unitCost: string | null;
  remark: string | null;
  createdAt: Date;
}
