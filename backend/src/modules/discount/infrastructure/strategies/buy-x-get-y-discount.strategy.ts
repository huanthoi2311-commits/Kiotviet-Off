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
 * Mua buyQuantity tặng getQuantity (miễn phí) trên productId — số đơn vị được tặng
 * = floor(quantity / (buyQuantity + getQuantity)) × getQuantity, discount = số đơn vị tặng
 * × unitPrice của chính sản phẩm đó (không dùng candidate.value).
 */
@Injectable()
export class BuyXGetYDiscountStrategy implements IDiscountStrategy {
  readonly type: DiscountType = 'BUY_X_GET_Y';

  calculate(
    context: DiscountStrategyContext,
    candidate: CandidateDiscount,
  ): Prisma.Decimal {
    const buyQuantity = candidate.buyQuantity ?? 0;
    const getQuantity = candidate.getQuantity ?? 0;
    if (!candidate.productId || buyQuantity <= 0 || getQuantity <= 0) {
      return new Prisma.Decimal(0);
    }

    const item = context.items.find((i) => i.productId === candidate.productId);
    if (!item) return new Prisma.Decimal(0);

    const groupSize = buyQuantity + getQuantity;
    const freeUnits = item.quantity.div(groupSize).floor().mul(getQuantity);
    return freeUnits.mul(item.unitPrice);
  }
}
