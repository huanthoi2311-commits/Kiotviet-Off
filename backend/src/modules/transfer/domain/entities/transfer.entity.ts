export type TransferStatus =
  'DRAFT' | 'PENDING' | 'APPROVED' | 'SHIPPING' | 'RECEIVED' | 'CANCELLED';

export interface TransferItemEntity {
  id: string;
  productId: string;
  quantity: string;
  unitCost: string | null;
}

export interface TransferEntity {
  id: string;
  organizationId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  code: string;
  status: TransferStatus;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  items: TransferItemEntity[];
}
