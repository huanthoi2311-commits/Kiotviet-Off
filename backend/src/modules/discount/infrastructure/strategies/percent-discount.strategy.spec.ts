import { Prisma } from '@prisma/client';
import { PercentDiscountStrategy } from './percent-discount.strategy';

describe('PercentDiscountStrategy', () => {
  const strategy = new PercentDiscountStrategy();

  it('tính đúng % trên currentTotal', () => {
    const result = strategy.calculate(
      { items: [], currentTotal: new Prisma.Decimal(200000) },
      { source: 'MANUAL', type: 'PERCENT', value: 10 },
    );
    expect(result.toFixed(2)).toBe('20000.00');
  });

  it('áp trần maxDiscount khi số tính ra vượt quá', () => {
    const result = strategy.calculate(
      { items: [], currentTotal: new Prisma.Decimal(1000000) },
      { source: 'VOUCHER', type: 'PERCENT', value: 20, maxDiscount: 50000 },
    );
    expect(result.toFixed(2)).toBe('50000.00');
  });

  it('không áp trần khi số tính ra thấp hơn maxDiscount', () => {
    const result = strategy.calculate(
      { items: [], currentTotal: new Prisma.Decimal(100000) },
      { source: 'VOUCHER', type: 'PERCENT', value: 10, maxDiscount: 50000 },
    );
    expect(result.toFixed(2)).toBe('10000.00');
  });

  it('value mặc định 0 khi không truyền', () => {
    const result = strategy.calculate(
      { items: [], currentTotal: new Prisma.Decimal(100000) },
      { source: 'MANUAL', type: 'PERCENT' },
    );
    expect(result.toFixed(2)).toBe('0.00');
  });
});
