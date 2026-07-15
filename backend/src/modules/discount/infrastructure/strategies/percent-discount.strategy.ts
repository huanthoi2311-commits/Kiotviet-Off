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

/** Giảm value% trên currentTotal, có trần maxDiscount nếu candidate khai (vd Voucher). */
@Injectable()
export class PercentDiscountStrategy implements IDiscountStrategy {
  readonly type: DiscountType = 'PERCENT';

  calculate(
    context: DiscountStrategyContext,
    candidate: CandidateDiscount,
  ): Prisma.Decimal {
    const percent = new Prisma.Decimal(candidate.value ?? 0);
    let amount = context.currentTotal.mul(percent).div(100);
    if (candidate.maxDiscount !== undefined) {
      const cap = new Prisma.Decimal(candidate.maxDiscount);
      if (amount.greaterThan(cap)) amount = cap;
    }
    return amount;
  }
}
