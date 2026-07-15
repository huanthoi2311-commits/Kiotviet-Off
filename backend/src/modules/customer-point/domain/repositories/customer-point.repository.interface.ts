import { CustomerPointLedgerEntity } from '../entities/customer-point-ledger.entity';

export interface AddPointInput {
  organizationId: string;
  customerId: string;
  /** Luôn là số dương — chiều (cộng) do addPoint() quyết định, không do caller truyền dấu. */
  point: number;
  referenceType?: string | null;
  referenceId?: string | null;
  expiredAt?: Date | null;
  createdBy: string;
}

export interface UsePointInput {
  organizationId: string;
  customerId: string;
  /** Luôn là số dương (số điểm muốn dùng) — usePoint() tự trừ, caller không truyền dấu âm. */
  point: number;
  referenceType?: string | null;
  referenceId?: string | null;
  createdBy: string;
}

export interface CustomerPointHistoryParams {
  organizationId: string;
  customerId: string;
  page: number;
  limit: number;
}

export interface CustomerPointHistoryResult {
  items: CustomerPointLedgerEntity[];
  total: number;
  page: number;
  limit: number;
}

/** Ném bởi usePoint() khi số điểm muốn dùng vượt quá số dư hiện tại (đọc lại trong transaction có khóa). */
export class CustomerPointInsufficientBalanceError extends Error {
  constructor(
    public readonly customerId: string,
    public readonly balance: number,
  ) {
    super(`Không đủ điểm để sử dụng (còn ${balance} điểm)`);
  }
}

/**
 * Mọi thay đổi điểm đều sinh 1 dòng CustomerPointLedger mới — không có đường nào update/xóa
 * dòng đã có (Prompt 032: "Mọi thay đổi → sinh Ledger"). `balance` được tính bằng cách khóa
 * dòng Customer tương ứng (SELECT ... FOR UPDATE) trước khi đọc dòng ledger gần nhất, chặn
 * race condition khi 2 thao tác cộng/trừ điểm cho CÙNG khách hàng chạy đồng thời.
 */
export interface ICustomerPointRepository {
  addPoint(input: AddPointInput): Promise<CustomerPointLedgerEntity>;
  /** Ném CustomerPointInsufficientBalanceError nếu point > số dư hiện tại. */
  usePoint(input: UsePointInput): Promise<CustomerPointLedgerEntity>;
  getHistory(
    params: CustomerPointHistoryParams,
  ): Promise<CustomerPointHistoryResult>;
  getBalance(organizationId: string, customerId: string): Promise<number>;
}

export const CUSTOMER_POINT_REPOSITORY = Symbol('CUSTOMER_POINT_REPOSITORY');
