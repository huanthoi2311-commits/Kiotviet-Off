import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CandidateDiscount,
  DiscountType,
} from '../../domain/entities/discount.entity';
import {
  DiscountStrategyContext,
  IDiscountStrategy,
} from '../../domain/strategies/discount-strategy.interface';

/** Giảm 1 khoản tiền cố định — clamp về currentTotal (không giảm quá phần còn lại) do
 *  DiscountEngineService xử lý tập trung, ở đây chỉ trả về giá trị đề xuất theo maxDiscount. */
@Injectable()
export class AmountDiscountStrategy implements IDiscountStrategy {
  readonly type: DiscountType = 'AMOUNT';

  calculate(
    _context: DiscountStrategyContext,
    candidate: CandidateDiscount,
  ): Prisma.Decimal {
    let amount = new Prisma.Decimal(candidate.value ?? 0);
    if (candidate.maxDiscount !== undefined) {
      const cap = new Prisma.Decimal(candidate.maxDiscount);
      if (amount.greaterThan(cap)) amount = cap;
    }
    return amount;
  }
}
