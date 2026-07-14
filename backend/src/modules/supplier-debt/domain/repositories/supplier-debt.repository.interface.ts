import {
  SupplierDebtEntity,
  SupplierPaymentEntity,
  SupplierPaymentMethod,
} from '../entities/supplier-debt.entity';

export interface SupplierDebtSearchParams {
  organizationId: string;
  search?: string;
  supplierId?: string;
  page: number;
  limit: number;
}

export interface SupplierDebtSearchResult {
  items: SupplierDebtEntity[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateSupplierPaymentInput {
  organizationId: string;
  branchId: string;
  supplierId: string;
  purchaseOrderId?: string | null;
  method: SupplierPaymentMethod;
  amount: number;
  paidAt: Date;
  createdBy: string;
}

/** Ném bởi createPayment() khi số tiền thanh toán vượt quá công nợ hiện tại (đọc lại trong transaction). */
export class SupplierPaymentExceedsBalanceError extends Error {
  constructor(
    public readonly supplierId: string,
    public readonly balance: string,
  ) {
    super(
      `Số tiền thanh toán vượt quá công nợ hiện tại của nhà cung cấp (còn nợ ${balance})`,
    );
  }
}

/**
 * Không có bảng `SupplierDebt`/`SupplierPayment` riêng — "Debt luôn khớp" (Prompt 029) đạt
 * được bằng cách KHÔNG BAO GIỜ ghi đè 1 con số công nợ, mà tính công nợ hiện tại (balance)
 * bằng phép trừ 2 tổng luôn được truy vấn trực tiếp (SUM), không lưu trung gian:
 *   balance = SUM(Debt.amount WHERE type=PAYABLE AND supplierId=X)
 *           - SUM(Payment.amount WHERE direction=OUT AND supplierId=X)
 * `Debt` đã là sổ cái ghi-thêm dùng chung từ Prompt 027 (Purchase → +amount) và Prompt 028
 * (Purchase Return → -amount); `Payment` (Foundation) là sổ cái các khoản đã chi cho NCC.
 * Module này chỉ ĐỌC (search/getBalance) và GHI THÊM (createPayment) — không có đường nào
 * update một dòng Debt/Payment đã tồn tại.
 */
export interface ISupplierDebtRepository {
  search(params: SupplierDebtSearchParams): Promise<SupplierDebtSearchResult>;
  /** Công nợ hiện tại của 1 Nhà cung cấp — dùng để validate trước khi tạo Payment. */
  getBalance(organizationId: string, supplierId: string): Promise<string>;
  /**
   * Ghi 1 dòng Payment (direction OUT) trong 1 transaction: đọc lại balance NGAY TRONG
   * transaction, ném SupplierPaymentExceedsBalanceError nếu amount > balance (chặn race
   * condition khi 2 thanh toán được tạo đồng thời).
   */
  createPayment(
    input: CreateSupplierPaymentInput,
  ): Promise<SupplierPaymentEntity>;
}

export const SUPPLIER_DEBT_REPOSITORY = Symbol('SUPPLIER_DEBT_REPOSITORY');
