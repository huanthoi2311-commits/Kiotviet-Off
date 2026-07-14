import { SupplierFieldsInput } from '../../domain/repositories/supplier.repository.interface';

export interface SupplierExcelColumn {
  header: string;
  key: keyof SupplierFieldsInput;
  width: number;
}

/** Cột dùng chung cho cả Export (sinh file) và Import (đọc header để map cột không phụ thuộc thứ tự). */
export const SUPPLIER_EXCEL_COLUMNS: SupplierExcelColumn[] = [
  { header: 'Mã NCC', key: 'code', width: 15 },
  { header: 'Mã số thuế', key: 'taxCode', width: 15 },
  { header: 'Tên công ty', key: 'companyName', width: 30 },
  { header: 'Người liên hệ', key: 'contactName', width: 20 },
  { header: 'Điện thoại', key: 'phone', width: 15 },
  { header: 'Email', key: 'email', width: 25 },
  { header: 'Website', key: 'website', width: 25 },
  { header: 'Địa chỉ', key: 'address', width: 30 },
  { header: 'Tỉnh/Thành', key: 'province', width: 15 },
  { header: 'Quận/Huyện', key: 'district', width: 15 },
  { header: 'Phường/Xã', key: 'ward', width: 15 },
  { header: 'Ngân hàng', key: 'bankName', width: 20 },
  { header: 'Số tài khoản', key: 'bankAccount', width: 20 },
  { header: 'Công nợ (ngày)', key: 'paymentTerm', width: 12 },
  { header: 'Hạn mức tín dụng', key: 'creditLimit', width: 15 },
  { header: 'Trạng thái', key: 'status', width: 12 },
  { header: 'Ghi chú', key: 'note', width: 30 },
];
