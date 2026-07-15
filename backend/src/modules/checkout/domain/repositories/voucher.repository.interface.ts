import { Prisma } from '@prisma/client';
import { VoucherEntity } from '../entities/voucher.entity';

/** Ném bởi incrementUsage() khi optimistic lock thất bại (usedCount đã đổi do giao dịch khác dùng cùng mã). */
export class VoucherConcurrencyConflictError extends Error {
  constructor(public readonly voucherId: string) {
    super('Mã giảm giá vừa được sử dụng bởi giao dịch khác, vui lòng thử lại');
  }
}

/**
 * Repository nội bộ của Checkout Engine — KHÔNG phải Voucher Module đầy đủ (không CRUD,
 * không public API). Chỉ đủ 2 việc Checkout cần: tra mã + tăng usedCount có optimistic lock.
 */
export interface IVoucherRepository {
  findActiveByCode(
    organizationId: string,
    code: string,
  ): Promise<VoucherEntity | null>;
  /**
   * `WHERE usedCount = previousUsedCount` đóng vai trò optimistic lock — nếu 1 giao dịch
   * khác đã dùng CÙNG mã giữa lúc đọc và lúc ghi ở đây, ném VoucherConcurrencyConflictError
   * thay vì cho usedCount vượt usageLimit do race condition.
   */
  incrementUsage(
    id: string,
    previousUsedCount: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
}

export const VOUCHER_REPOSITORY = Symbol('VOUCHER_REPOSITORY');
