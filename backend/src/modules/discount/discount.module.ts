import { Module } from '@nestjs/common';
import { DiscountEngineService } from './application/discount-engine.service';
import { DISCOUNT_STRATEGIES } from './domain/strategies/discount-strategy.interface';
import { AmountDiscountStrategy } from './infrastructure/strategies/amount-discount.strategy';
import { BuyXGetYDiscountStrategy } from './infrastructure/strategies/buy-x-get-y-discount.strategy';
import { FixedPriceDiscountStrategy } from './infrastructure/strategies/fixed-price-discount.strategy';
import { PercentDiscountStrategy } from './infrastructure/strategies/percent-discount.strategy';

/** Internal Service (Prompt 034) — không có controllers[], không expose route public nào. */
@Module({
  providers: [
    DiscountEngineService,
    PercentDiscountStrategy,
    AmountDiscountStrategy,
    FixedPriceDiscountStrategy,
    BuyXGetYDiscountStrategy,
    {
      provide: DISCOUNT_STRATEGIES,
      useFactory: (
        percent: PercentDiscountStrategy,
        amount: AmountDiscountStrategy,
        fixedPrice: FixedPriceDiscountStrategy,
        buyXGetY: BuyXGetYDiscountStrategy,
      ) => [percent, amount, fixedPrice, buyXGetY],
      inject: [
        PercentDiscountStrategy,
        AmountDiscountStrategy,
        FixedPriceDiscountStrategy,
        BuyXGetYDiscountStrategy,
      ],
    },
  ],
  exports: [DiscountEngineService],
})
export class DiscountModule {}
