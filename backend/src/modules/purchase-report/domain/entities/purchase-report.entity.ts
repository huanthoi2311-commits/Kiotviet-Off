export type PurchaseReportGroupBy =
  'SUPPLIER' | 'PRODUCT' | 'WAREHOUSE' | 'MONTH' | 'USER' | 'CATEGORY';

/** Một dòng phân tích theo 1 trong 6 chiều (Supplier/Product/Warehouse/Month/User/Category). */
export interface PurchaseReportBreakdownItemEntity {
  key: string;
  code: string | null;
  label: string;
  totalAmount: string;
  totalQuantity: string;
  orderCount: number;
}

export interface PurchaseReportDashboardEntity {
  totalAmount: string;
  totalOrders: number;
  /** Bình quân gia quyền = tổng giá trị nhập / tổng số lượng nhập (toàn bộ PurchaseItem đã RECEIVED). */
  averageCost: string;
  topSuppliers: PurchaseReportBreakdownItemEntity[];
  topProducts: PurchaseReportBreakdownItemEntity[];
  monthlyPurchase: PurchaseReportBreakdownItemEntity[];
}
