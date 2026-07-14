export type SupplierPaymentMethod =
  'CASH' | 'BANK_TRANSFER' | 'CARD' | 'E_WALLET';

/**
 * "SupplierDebt" là một hàng tổng hợp (aggregate), KHÔNG phải 1 dòng DB — được tính từ
 * sổ cái ghi-thêm dùng chung `Debt` (Purchase Order ghi dương, Purchase Return ghi âm)
 * đối trừ với `Payment` (hướng OUT). Xem giải thích đầy đủ trong repository interface.
 */
export interface SupplierDebtEntity {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  totalDebt: string;
  totalPaid: string;
  balance: string;
}

export interface SupplierPaymentEntity {
  id: string;
  organizationId: string;
  branchId: string;
  supplierId: string;
  purchaseOrderId: string | null;
  method: string;
  amount: string;
  paidAt: Date;
  createdAt: Date;
}
