import { Prisma } from '@prisma/client';
import { DiscountLineItem } from '../../domain/entities/discount.entity';
import { BuyXGetYDiscountStrategy } from './buy-x-get-y-discount.strategy';

describe('BuyXGetYDiscountStrategy', () => {
  const strategy = new BuyXGetYDiscountStrategy();
  const item: DiscountLineItem = {
    productId: 'prod-1',
    categoryId: 'cat-1',
    quantity: new Prisma.Decimal(7),
    unitPrice: new Prisma.Decimal(50000),
  };

  it('mua 2 tặng 1: 7 sản phẩm → 2 nhóm đủ (6 cái) → tặng 2 cái', () => {
    const result = strategy.calculate(
      { items: [item], currentTotal: new Prisma.Decimal(350000) },
      {
        source: 'PROMOTION',
        type: 'BUY_X_GET_Y',
        productId: 'prod-1',
        buyQuantity: 2,
        getQuantity: 1,
      },
    );
    // floor(7/3) = 2 nhóm đủ → 2 * 1 * 50000 = 100000
    expect(result.toFixed(2)).toBe('100000.00');
  });

  it('không đủ số lượng tối thiểu 1 nhóm → không giảm', () => {
    const result = strategy.calculate(
      {
        items: [{ ...item, quantity: new Prisma.Decimal(2) }],
        currentTotal: new Prisma.Decimal(100000),
      },
      {
        source: 'PROMOTION',
        type: 'BUY_X_GET_Y',
        productId: 'prod-1',
        buyQuantity: 3,
        getQuantity: 1,
      },
    );
    expect(result.toFixed(2)).toBe('0.00');
  });

  it('trả về 0 khi productId không có trong giỏ', () => {
    const result = strategy.calculate(
      { items: [item], currentTotal: new Prisma.Decimal(350000) },
      {
        source: 'PROMOTION',
        type: 'BUY_X_GET_Y',
        productId: 'prod-x',
        buyQuantity: 2,
        getQuantity: 1,
      },
    );
    expect(result.toFixed(2)).toBe('0.00');
  });

  it('trả về 0 khi buyQuantity hoặc getQuantity <= 0 (chặn chia cho 0)', () => {
    const result = strategy.calculate(
      { items: [item], currentTotal: new Prisma.Decimal(350000) },
      {
        source: 'PROMOTION',
        type: 'BUY_X_GET_Y',
        productId: 'prod-1',
        buyQuantity: 0,
        getQuantity: 1,
      },
    );
    expect(result.toFixed(2)).toBe('0.00');
  });

  it('trả về 0 khi thiếu buyQuantity/getQuantity (mặc định 0, chặn chia cho 0)', () => {
    const result = strategy.calculate(
      { items: [item], currentTotal: new Prisma.Decimal(350000) },
      { source: 'PROMOTION', type: 'BUY_X_GET_Y', productId: 'prod-1' },
    );
    expect(result.toFixed(2)).toBe('0.00');
  });

  it('trả về 0 khi thiếu productId', () => {
    const result = strategy.calculate(
      { items: [item], currentTotal: new Prisma.Decimal(350000) },
      {
        source: 'PROMOTION',
        type: 'BUY_X_GET_Y',
        buyQuantity: 2,
        getQuantity: 1,
      },
    );
    expect(result.toFixed(2)).toBe('0.00');
  });
});
