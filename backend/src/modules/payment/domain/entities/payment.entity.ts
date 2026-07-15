export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'E_WALLET';

/**
 * Bảng `payments` (Foundation) là sổ cái CHUNG cho cả 2 chiều tiền: chi cho nhà cung cấp
 * (Supplier Debt module, Prompt 029, direction OUT) và thu từ khách hàng qua hóa đơn
 * (module này, Prompt 035, direction IN, luôn gắn invoiceId). Không tạo bảng riêng —
 * tái sử dụng đúng tinh thần "Debt/Payment ledger dùng chung" đã thiết lập ở Prompt 029.
 */
export interface PaymentEntity {
  id: string;
  organizationId: string;
  branchId: string;
  invoiceId: string;
  customerId: string | null;
  method: PaymentMethod;
  amount: string;
  paidAt: Date;
  createdAt: Date;
}
