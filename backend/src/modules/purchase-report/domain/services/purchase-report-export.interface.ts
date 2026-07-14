import { PurchaseReportBreakdownItemEntity } from '../entities/purchase-report.entity';

/**
 * Cô lập exceljs/pdfkit khỏi domain/application — cùng nguyên tắc đã áp dụng cho
 * ISupplierExcelPort (Prompt 026). CSV không cần thư viện ngoài (string thuần) nhưng vẫn
 * gộp chung 1 port để application xử lý cả 3 định dạng đồng nhất qua 1 interface.
 */
export interface IPurchaseReportExportPort {
  buildExcel(
    title: string,
    items: PurchaseReportBreakdownItemEntity[],
  ): Promise<Buffer>;
  buildCsv(items: PurchaseReportBreakdownItemEntity[]): string;
  buildPdf(
    title: string,
    items: PurchaseReportBreakdownItemEntity[],
  ): Promise<Buffer>;
}

export const PURCHASE_REPORT_EXPORT_PORT = Symbol(
  'PURCHASE_REPORT_EXPORT_PORT',
);
