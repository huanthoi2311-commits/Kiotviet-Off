import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AppliedDiscount,
  CandidateDiscount,
  DISCOUNT_PRIORITY,
  DiscountCalculationResult,
  DiscountLineItem,
  DiscountType,
} from '../domain/entities/discount.entity';
import {
  DISCOUNT_STRATEGIES,
  IDiscountStrategy,
} from '../domain/strategies/discount-strategy.interface';

/**
 * Internal Service (Prompt 034) — KHÔNG có Controller/DTO/route public. Caller (Checkout
 * Engine, Prompt 035) tự tra cứu Promotion/Voucher/Member rồi chuẩn bị CandidateDiscount[];
 * Engine chỉ áp dụng đúng Strategy theo type, đúng thứ tự ưu tiên Manual→Promotion→Voucher→
 * Member, cascading (mỗi discount tính trên phần CÒN LẠI sau các discount ưu tiên cao hơn).
 *
 * "0 đồng sai số" (Acceptance) được đảm bảo CÓ CẤU TRÚC, không chỉ do test pass ngẫu nhiên:
 * mỗi bước làm tròn 2 chữ số NGAY khi trừ khỏi currentTotal, và totalDiscount luôn tính bằng
 * subtotal - finalTotal (không cộng dồn amount độc lập) — nên subtotal ≡ finalTotal +
 * totalDiscount ĐÚNG TUYỆT ĐỐI với mọi tổ hợp discount, không phụ thuộc thứ tự làm tròn.
 */
@Injectable()
export class DiscountEngineService {
  private readonly strategies: Map<DiscountType, IDiscountStrategy>;

  constructor(@Inject(DISCOUNT_STRATEGIES) strategies: IDiscountStrategy[]) {
    this.strategies = new Map(strategies.map((s) => [s.type, s]));
  }

  calculate(
    items: DiscountLineItem[],
    subtotal: Prisma.Decimal,
    candidates: CandidateDiscount[],
  ): DiscountCalculationResult {
    const sorted = [...candidates].sort(
      (a, b) => DISCOUNT_PRIORITY[a.source] - DISCOUNT_PRIORITY[b.source],
    );

    let currentTotal = subtotal;
    const appliedDiscounts: AppliedDiscount[] = [];

    for (const candidate of sorted) {
      const strategy = this.strategies.get(candidate.type);
      if (!strategy) continue;

      const raw = strategy.calculate({ items, currentTotal }, candidate);
      const clamped = this.clamp(raw, currentTotal);
      if (clamped.isZero()) continue;

      currentTotal = currentTotal.minus(clamped);
      appliedDiscounts.push({
        source: candidate.source,
        type: candidate.type,
        label: candidate.label,
        amount: clamped.toFixed(2),
      });
    }

    return {
      subtotal: subtotal.toFixed(2),
      totalDiscount: subtotal.minus(currentTotal).toFixed(2),
      finalTotal: currentTotal.toFixed(2),
      appliedDiscounts,
    };
  }

  /** Làm tròn 2 chữ số NGAY tại đây rồi mới trả về — currentTotal luôn là Decimal "sạch"
   *  (đã tròn), tránh sai số cộng dồn qua nhiều bước cascading. */
  private clamp(
    amount: Prisma.Decimal,
    currentTotal: Prisma.Decimal,
  ): Prisma.Decimal {
    let result = amount;
    if (result.lessThan(0)) result = new Prisma.Decimal(0);
    if (result.greaterThan(currentTotal)) result = currentTotal;
    return new Prisma.Decimal(result.toFixed(2));
  }
}
