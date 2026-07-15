import { Prisma } from '@prisma/client';
import {
  CandidateDiscount,
  DiscountLineItem,
  DiscountType,
} from '../entities/discount.entity';

export interface DiscountStrategyContext {
  items: DiscountLineItem[];
  /** Tổng còn lại SAU khi các discount ưu tiên cao hơn đã trừ (cascading). */
  currentTotal: Prisma.Decimal;
}

/**
 * Strategy Pattern (Prompt 034) — mỗi DiscountType có đúng 1 implementation. calculate() chỉ
 * trả về SỐ TIỀN GIẢM đề xuất (Decimal, có thể âm/vượt currentTotal khi input bất thường);
 * việc clamp về [0, currentTotal] và làm tròn 2 chữ số do DiscountEngineService xử lý tập
 * trung — Strategy không tự làm tròn để tránh sai số cộng dồn khi nhiều discount áp liên tiếp.
 */
export interface IDiscountStrategy {
  readonly type: DiscountType;
  calculate(
    context: DiscountStrategyContext,
    candidate: CandidateDiscount,
  ): Prisma.Decimal;
}

export const DISCOUNT_STRATEGIES = Symbol('DISCOUNT_STRATEGIES');
