export type InventoryAdjustmentStatus =
  'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'COMPLETED';

export type InventoryAdjustmentReason =
  'LOST' | 'DAMAGED' | 'FOUND' | 'SYSTEM' | 'OTHER';

export interface InventoryAdjustmentItemEntity {
  id: string;
  productId: string;
  /** Delta có dấu (dương = tăng tồn kho, âm = giảm) do người tạo nhập khi tạo phiếu. */
  quantity: string;
  remark: string | null;
}

export interface InventoryAdjustmentEntity {
  id: string;
  organizationId: string;
  warehouseId: string;
  code: string;
  status: InventoryAdjustmentStatus;
  reason: InventoryAdjustmentReason;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  items: InventoryAdjustmentItemEntity[];
}
