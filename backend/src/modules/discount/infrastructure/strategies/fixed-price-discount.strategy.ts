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

/**
 * Ấn định giá bán mới (đơn giá cố định) cho productId — discount = (giá gốc - giá cố định)
 * × quantity của đúng sản phẩm đó. Không tìm thấy productId trong giỏ → 0 (Engine không lỗi,
 * vì Promotion có thể áp toàn tổ chức mà khách hàng không mua đúng sản phẩm đó lần này).
 */
@Injectable()
export class FixedPriceDiscountStrategy implements IDiscountStrategy {
  readonly type: DiscountType = 'FIXED_PRICE';

  calculate(
    context: DiscountStrategyContext,
    candidate: CandidateDiscount,
  ): Prisma.Decimal {
    if (!candidate.productId || candidate.value === undefined) {
      return new Prisma.Decimal(0);
    }
    const fixedPrice = new Prisma.Decimal(candidate.value);
    let discount = new Prisma.Decimal(0);
    for (const item of context.items) {
      if (item.productId !== candidate.productId) continue;
      const originalLineTotal = item.unitPrice.mul(item.quantity);
      const newLineTotal = fixedPrice.mul(item.quantity);
      const lineDiscount = originalLineTotal.minus(newLineTotal);
      if (lineDiscount.greaterThan(0)) {
        discount = discount.plus(lineDiscount);
      }
    }
    return discount;
  }
}
