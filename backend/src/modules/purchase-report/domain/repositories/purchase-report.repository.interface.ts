import {
  PurchaseReportBreakdownItemEntity,
  PurchaseReportDashboardEntity,
  PurchaseReportGroupBy,
} from '../entities/purchase-report.entity';

export interface PurchaseReportFilterParams {
  organizationId: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface PurchaseReportBreakdownParams extends PurchaseReportFilterParams {
  groupBy: PurchaseReportGroupBy;
  page: number;
  limit: number;
}

export interface PurchaseReportBreakdownResult {
  items: PurchaseReportBreakdownItemEntity[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Mọi truy vấn báo cáo đều là SQL aggregation (SUM/COUNT/GROUP BY chạy trong Postgres),
 * KHÔNG bao giờ tải PurchaseOrder/PurchaseItem thô về Node rồi cộng dồn bằng JS — đây là
 * điều kiện bắt buộc để đạt "100.000 Purchase phải xử lý <3s" (Prompt 030). Chỉ tính các
 * đơn đã RECEIVED/COMPLETED (đơn DRAFT/APPROVED chưa có Movement thật, CANCELLED không có
 * giá trị nhập hàng thực tế).
 */
export interface IPurchaseReportRepository {
  getDashboard(
    params: PurchaseReportFilterParams,
  ): Promise<PurchaseReportDashboardEntity>;
  /** Phân tích theo 1 trong 6 chiều: Supplier/Product/Warehouse/Month/User/Category. */
  getBreakdown(
    params: PurchaseReportBreakdownParams,
  ): Promise<PurchaseReportBreakdownResult>;
}

export const PURCHASE_REPORT_REPOSITORY = Symbol('PURCHASE_REPORT_REPOSITORY');
