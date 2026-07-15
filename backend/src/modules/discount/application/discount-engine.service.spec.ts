import { Prisma } from '@prisma/client';
import {
  CandidateDiscount,
  DiscountLineItem,
  DiscountSource,
  DiscountType,
} from '../domain/entities/discount.entity';
import { AmountDiscountStrategy } from '../infrastructure/strategies/amount-discount.strategy';
import { BuyXGetYDiscountStrategy } from '../infrastructure/strategies/buy-x-get-y-discount.strategy';
import { FixedPriceDiscountStrategy } from '../infrastructure/strategies/fixed-price-discount.strategy';
import { PercentDiscountStrategy } from '../infrastructure/strategies/percent-discount.strategy';
import { DiscountEngineService } from './discount-engine.service';

describe('DiscountEngineService', () => {
  let engine: DiscountEngineService;

  beforeEach(() => {
    engine = new DiscountEngineService([
      new PercentDiscountStrategy(),
      new AmountDiscountStrategy(),
      new FixedPriceDiscountStrategy(),
      new BuyXGetYDiscountStrategy(),
    ]);
  });

  const item: DiscountLineItem = {
    productId: 'prod-1',
    categoryId: 'cat-1',
    quantity: new Prisma.Decimal(2),
    unitPrice: new Prisma.Decimal(100000),
  };

  it('không có candidate nào → finalTotal = subtotal, totalDiscount = 0', () => {
    const result = engine.calculate([item], new Prisma.Decimal(200000), []);
    expect(result.subtotal).toBe('200000.00');
    expect(result.totalDiscount).toBe('0.00');
    expect(result.finalTotal).toBe('200000.00');
    expect(result.appliedDiscounts).toEqual([]);
  });

  it('áp đúng thứ tự ưu tiên Manual → Promotion → Voucher → Member dù input không theo thứ tự', () => {
    const candidates: CandidateDiscount[] = [
      { source: 'MEMBER', type: 'AMOUNT', value: 1000 },
      { source: 'VOUCHER', type: 'AMOUNT', value: 1000 },
      { source: 'MANUAL', type: 'AMOUNT', value: 1000 },
      { source: 'PROMOTION', type: 'AMOUNT', value: 1000 },
    ];
    const result = engine.calculate(
      [item],
      new Prisma.Decimal(200000),
      candidates,
    );
    expect(result.appliedDiscounts.map((d) => d.source)).toEqual([
      'MANUAL',
      'PROMOTION',
      'VOUCHER',
      'MEMBER',
    ]);
  });

  it('cascading: discount sau tính trên phần CÒN LẠI, không phải subtotal gốc', () => {
    const candidates: CandidateDiscount[] = [
      { source: 'MANUAL', type: 'PERCENT', value: 10 }, // 200000 -> giảm 20000 -> còn 180000
      { source: 'PROMOTION', type: 'PERCENT', value: 10 }, // 180000 -> giảm 18000 -> còn 162000
    ];
    const result = engine.calculate(
      [item],
      new Prisma.Decimal(200000),
      candidates,
    );
    expect(result.appliedDiscounts[0].amount).toBe('20000.00');
    expect(result.appliedDiscounts[1].amount).toBe('18000.00');
    expect(result.finalTotal).toBe('162000.00');
    expect(result.totalDiscount).toBe('38000.00');
  });

  it('clamp: không giảm quá phần còn lại (finalTotal không bao giờ âm)', () => {
    const candidates: CandidateDiscount[] = [
      { source: 'MANUAL', type: 'AMOUNT', value: 150000 },
      { source: 'PROMOTION', type: 'AMOUNT', value: 150000 },
    ];
    const result = engine.calculate(
      [item],
      new Prisma.Decimal(200000),
      candidates,
    );
    expect(result.finalTotal).toBe('0.00');
    expect(result.totalDiscount).toBe('200000.00');
    expect(result.appliedDiscounts[1].amount).toBe('50000.00');
  });

  it('clamp: giá trị âm (input bất thường) được đưa về 0, không tạo discount âm', () => {
    const candidates: CandidateDiscount[] = [
      { source: 'MANUAL', type: 'AMOUNT', value: -5000 },
    ];
    const result = engine.calculate(
      [item],
      new Prisma.Decimal(200000),
      candidates,
    );
    expect(result.appliedDiscounts).toEqual([]);
    expect(result.finalTotal).toBe('200000.00');
  });

  it('bỏ qua candidate có amount = 0, không đẩy vào appliedDiscounts', () => {
    const candidates: CandidateDiscount[] = [
      { source: 'MANUAL', type: 'AMOUNT', value: 0 },
    ];
    const result = engine.calculate(
      [item],
      new Prisma.Decimal(200000),
      candidates,
    );
    expect(result.appliedDiscounts).toEqual([]);
  });

  it('bỏ qua an toàn khi type không xác định trong strategy registry', () => {
    const candidates: CandidateDiscount[] = [
      { source: 'MANUAL', type: 'UNKNOWN_TYPE' as DiscountType, value: 1000 },
    ];
    const result = engine.calculate(
      [item],
      new Prisma.Decimal(200000),
      candidates,
    );
    expect(result.appliedDiscounts).toEqual([]);
    expect(result.finalTotal).toBe('200000.00');
  });

  it('kết hợp đủ 4 loại discount cùng lúc, đúng cascading và không sai số', () => {
    const items: DiscountLineItem[] = [
      {
        productId: 'prod-fixed',
        categoryId: 'cat-1',
        quantity: new Prisma.Decimal(2),
        unitPrice: new Prisma.Decimal(50000),
      },
      {
        productId: 'prod-bxgy',
        categoryId: 'cat-1',
        quantity: new Prisma.Decimal(6),
        unitPrice: new Prisma.Decimal(20000),
      },
    ];
    // subtotal = 2*50000 + 6*20000 = 220000
    const subtotal = new Prisma.Decimal(220000);
    const candidates: CandidateDiscount[] = [
      {
        source: 'MANUAL',
        type: 'FIXED_PRICE',
        productId: 'prod-fixed',
        value: 40000,
      }, // (50000-40000)*2 = 20000
      {
        source: 'PROMOTION',
        type: 'BUY_X_GET_Y',
        productId: 'prod-bxgy',
        buyQuantity: 2,
        getQuantity: 1,
      }, // floor(6/3)*1*20000 = 40000
      { source: 'VOUCHER', type: 'PERCENT', value: 10, maxDiscount: 100000 },
      { source: 'MEMBER', type: 'AMOUNT', value: 5000 },
    ];

    const result = engine.calculate(items, subtotal, candidates);
    // step1: 220000 - 20000 = 200000
    // step2: 200000 - 40000 = 160000
    // step3: 160000 - 16000 (10%) = 144000
    // step4: 144000 - 5000 = 139000
    expect(result.appliedDiscounts.map((d) => d.amount)).toEqual([
      '20000.00',
      '40000.00',
      '16000.00',
      '5000.00',
    ]);
    expect(result.finalTotal).toBe('139000.00');
    expect(result.totalDiscount).toBe('81000.00');

    const reconstructed = new Prisma.Decimal(result.finalTotal).plus(
      result.totalDiscount,
    );
    expect(reconstructed.toFixed(2)).toBe(subtotal.toFixed(2));
  });

  describe('100 Rule — Acceptance: sai số 0 đồng', () => {
    const sources: DiscountSource[] = [
      'MANUAL',
      'PROMOTION',
      'VOUCHER',
      'MEMBER',
    ];
    const types: DiscountType[] = [
      'PERCENT',
      'AMOUNT',
      'FIXED_PRICE',
      'BUY_X_GET_Y',
    ];

    function buildCandidate(
      source: DiscountSource,
      type: DiscountType,
      seed: number,
      productId: string,
    ): CandidateDiscount {
      switch (type) {
        case 'PERCENT':
          return { source, type, value: seed % 50 };
        case 'AMOUNT':
          return { source, type, value: 1000 * (seed % 100) };
        case 'FIXED_PRICE':
          return {
            source,
            type,
            productId,
            value: 5000 + ((seed * 137) % 90000),
          };
        case 'BUY_X_GET_Y':
          return {
            source,
            type,
            productId,
            buyQuantity: 1 + (seed % 3),
            getQuantity: 1 + (seed % 2),
          };
      }
    }

    it.each(Array.from({ length: 100 }, (_, i) => i))(
      'rule #%i: subtotal luôn khớp finalTotal + totalDiscount tuyệt đối, finalTotal không âm',
      (i) => {
        const items: DiscountLineItem[] = [
          {
            productId: 'prod-1',
            categoryId: 'cat-1',
            quantity: new Prisma.Decimal(1 + (i % 10)),
            unitPrice: new Prisma.Decimal(10000 + ((i * 977) % 90000)),
          },
        ];
        const subtotal = items[0].unitPrice.mul(items[0].quantity);

        const count = 1 + (i % 4);
        const candidates: CandidateDiscount[] = Array.from(
          { length: count },
          (_, k) =>
            buildCandidate(
              sources[(i + k) % sources.length],
              types[(i + k * 2) % types.length],
              i + k * 31,
              items[0].productId,
            ),
        );

        const result = engine.calculate(items, subtotal, candidates);

        const reconstructed = new Prisma.Decimal(result.finalTotal).plus(
          result.totalDiscount,
        );
        expect(reconstructed.toFixed(2)).toBe(
          new Prisma.Decimal(result.subtotal).toFixed(2),
        );
        expect(
          new Prisma.Decimal(result.finalTotal).greaterThanOrEqualTo(0),
        ).toBe(true);
        expect(
          new Prisma.Decimal(result.totalDiscount).lessThanOrEqualTo(subtotal),
        ).toBe(true);
      },
    );
  });
});
