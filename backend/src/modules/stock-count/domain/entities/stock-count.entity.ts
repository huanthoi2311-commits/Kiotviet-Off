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
  /** T051.02 — Optimistic Lock, chỉ được CAS/tăng trong `complete()`. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  items: StockCountItemEntity[];
}
