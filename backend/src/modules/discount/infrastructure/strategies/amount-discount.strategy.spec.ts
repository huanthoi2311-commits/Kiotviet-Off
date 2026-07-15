import { Prisma } from '@prisma/client';
import { AmountDiscountStrategy } from './amount-discount.strategy';

describe('AmountDiscountStrategy', () => {
  const strategy = new AmountDiscountStrategy();
  const context = { items: [], currentTotal: new Prisma.Decimal(200000) };

  it('trả về đúng value', () => {
    const result = strategy.calculate(context, {
      source: 'MANUAL',
      type: 'AMOUNT',
      value: 15000,
    });
    expect(result.toFixed(2)).toBe('15000.00');
  });

  it('áp trần maxDiscount khi value vượt quá', () => {
    const result = strategy.calculate(context, {
      source: 'VOUCHER',
      type: 'AMOUNT',
      value: 100000,
      maxDiscount: 30000,
    });
    expect(result.toFixed(2)).toBe('30000.00');
  });

  it('không áp trần khi value thấp hơn maxDiscount', () => {
    const result = strategy.calculate(context, {
      source: 'VOUCHER',
      type: 'AMOUNT',
      value: 10000,
      maxDiscount: 30000,
    });
    expect(result.toFixed(2)).toBe('10000.00');
  });

  it('value mặc định 0 khi không truyền', () => {
    const result = strategy.calculate(context, {
      source: 'MANUAL',
      type: 'AMOUNT',
    });
    expect(result.toFixed(2)).toBe('0.00');
  });
});
