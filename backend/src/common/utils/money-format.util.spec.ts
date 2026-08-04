import { Prisma } from '@prisma/client';
import { formatMoney } from './money-format.util';

describe('formatMoney', () => {
  it('số nguyên → 2 chữ số thập phân', () => {
    expect(formatMoney(new Prisma.Decimal('300000'))).toBe('300000.00');
  });

  it('1 chữ số thập phân → pad thêm 1 số 0', () => {
    expect(formatMoney(new Prisma.Decimal('300000.5'))).toBe('300000.50');
  });

  it('đủ 2 chữ số thập phân → giữ nguyên', () => {
    expect(formatMoney(new Prisma.Decimal('300000.55'))).toBe('300000.55');
  });

  it('giá trị 0 → "0.00"', () => {
    expect(formatMoney(new Prisma.Decimal('0'))).toBe('0.00');
  });
});
