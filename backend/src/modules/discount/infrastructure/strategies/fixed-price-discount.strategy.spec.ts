import { Prisma } from '@prisma/client';
import { DiscountLineItem } from '../../domain/entities/discount.entity';
import { FixedPriceDiscountStrategy } from './fixed-price-discount.strategy';

describe('FixedPriceDiscountStrategy', () => {
  const strategy = new FixedPriceDiscountStrategy();
  const item: DiscountLineItem = {
    productId: 'prod-1',
    categoryId: 'cat-1',
    quantity: new Prisma.Decimal(3),
    unitPrice: new Prisma.Decimal(100000),
  };

  it('tính đúng chênh lệch (giá gốc - giá cố định) × quantity', () => {
    const result = strategy.calculate(
      { items: [item], currentTotal: new Prisma.Decimal(300000) },
      {
        source: 'PROMOTION',
        type: 'FIXED_PRICE',
        productId: 'prod-1',
        value: 80000,
      },
    );
    // (100000 - 80000) * 3 = 60000
    expect(result.toFixed(2)).toBe('60000.00');
  });

  it('trả về 0 khi giá cố định cao hơn giá gốc (không giảm âm)', () => {
    const result = strategy.calculate(
      { items: [item], currentTotal: new Prisma.Decimal(300000) },
      {
        source: 'PROMOTION',
        type: 'FIXED_PRICE',
        productId: 'prod-1',
        value: 150000,
      },
    );
    expect(result.toFixed(2)).toBe('0.00');
  });

  it('trả về 0 khi productId không có trong giỏ', () => {
    const result = strategy.calculate(
      { items: [item], currentTotal: new Prisma.Decimal(300000) },
      {
        source: 'PROMOTION',
        type: 'FIXED_PRICE',
        productId: 'prod-x',
        value: 50000,
      },
    );
    expect(result.toFixed(2)).toBe('0.00');
  });

  it('trả về 0 khi thiếu productId hoặc value', () => {
    const result = strategy.calculate(
      { items: [item], currentTotal: new Prisma.Decimal(300000) },
      { source: 'PROMOTION', type: 'FIXED_PRICE' },
    );
    expect(result.toFixed(2)).toBe('0.00');
  });

  it('cộng dồn đúng khi có nhiều dòng trùng productId', () => {
    const result = strategy.calculate(
      {
        items: [item, { ...item, quantity: new Prisma.Decimal(2) }],
        currentTotal: new Prisma.Decimal(500000),
      },
      {
        source: 'PROMOTION',
        type: 'FIXED_PRICE',
        productId: 'prod-1',
        value: 80000,
      },
    );
    // (100000-80000)*3 + (100000-80000)*2 = 60000 + 40000 = 100000
    expect(result.toFixed(2)).toBe('100000.00');
  });
});
