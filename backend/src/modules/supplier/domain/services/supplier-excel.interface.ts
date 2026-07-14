import { SupplierEntity } from '../entities/supplier.entity';

/**
 * Cổng vào/ra file Excel — tách khỏi domain/application để không lộ thư viện cụ thể
 * (exceljs) ra ngoài infrastructure, cùng nguyên tắc với Prisma chỉ xuất hiện trong
 * infrastructure/persistence.
 */
export interface ISupplierExcelPort {
  buildWorkbookBuffer(suppliers: SupplierEntity[]): Promise<Buffer>;
  /** Đọc file, trả về danh sách dòng dữ liệu thô (theo header cột, chưa validate). */
  parseRows(buffer: Buffer): Promise<Record<string, unknown>[]>;
}

export const SUPPLIER_EXCEL_PORT = Symbol('SUPPLIER_EXCEL_PORT');
