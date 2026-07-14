import { Prisma } from '@prisma/client';
import { applyInventoryDelta } from './average-cost.util';

describe('applyInventoryDelta', () => {
  it('khởi tạo từ 0 khi nhập kho lần đầu', () => {
    const result = applyInventoryDelta({
      beforeQuantity: new Prisma.Decimal(0),
      beforeAvgCost: new Prisma.Decimal(0),
      delta: new Prisma.Decimal(100),
      unitCost: new Prisma.Decimal(50),
    });
    expect(result.afterQuantity.toString()).toBe('100');
    expect(result.avgCost.toString()).toBe('50');
    expect(result.lastCost?.toString()).toBe('50');
  });

  it('tính đúng bình quân gia quyền khi nhập thêm với đơn giá khác', () => {
    const result = applyInventoryDelta({
      beforeQuantity: new Prisma.Decimal(100),
      beforeAvgCost: new Prisma.Decimal(50),
      delta: new Prisma.Decimal(50),
      unitCost: new Prisma.Decimal(80),
    });
    // (100*50 + 50*80) / 150 = 60
    expect(result.afterQuantity.toString()).toBe('150');
    expect(result.avgCost.toString()).toBe('60');
    expect(result.lastCost?.toString()).toBe('80');
  });

  it('xuất kho không tính lại avgCost, giữ nguyên beforeAvgCost, lastCost null', () => {
    const result = applyInventoryDelta({
      beforeQuantity: new Prisma.Decimal(150),
      beforeAvgCost: new Prisma.Decimal(60),
      delta: new Prisma.Decimal(-30),
    });
    expect(result.afterQuantity.toString()).toBe('120');
    expect(result.avgCost.toString()).toBe('60');
    expect(result.lastCost).toBeNull();
  });

  it('nhập kho nhưng không có unitCost thì không tính lại avgCost', () => {
    const result = applyInventoryDelta({
      beforeQuantity: new Prisma.Decimal(100),
      beforeAvgCost: new Prisma.Decimal(50),
      delta: new Prisma.Decimal(20),
      unitCost: null,
    });
    expect(result.afterQuantity.toString()).toBe('120');
    expect(result.avgCost.toString()).toBe('50');
    expect(result.lastCost).toBeNull();
  });

  it('không chia cho 0 khi afterQuantity bằng 0 dù có nhập kho (beforeQuantity âm)', () => {
    const result = applyInventoryDelta({
      beforeQuantity: new Prisma.Decimal(-50),
      beforeAvgCost: new Prisma.Decimal(50),
      delta: new Prisma.Decimal(50),
      unitCost: new Prisma.Decimal(80),
    });
    expect(result.afterQuantity.toString()).toBe('0');
    expect(result.avgCost.toString()).toBe('0');
  });
});
