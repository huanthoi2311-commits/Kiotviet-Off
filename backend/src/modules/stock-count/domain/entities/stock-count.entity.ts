export type StockCountStatus = 'DRAFT' | 'COUNTING' | 'COMPLETED' | 'CANCELLED';

export interface StockCountItemEntity {
  id: string;
  productId: string;
  systemQty: string;
  actualQty: string | null;
  difference: string | null;
  remark: string | null;
}

export interface StockCountEntity {
  id: string;
  organizationId: string;
  warehouseId: string;
  code: string;
  status: StockCountStatus;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  items: StockCountItemEntity[];
}
