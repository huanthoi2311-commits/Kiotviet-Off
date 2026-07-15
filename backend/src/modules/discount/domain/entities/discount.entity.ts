import { Prisma } from '@prisma/client';

/** 4 loại giảm giá Engine hỗ trợ (Prompt 034) — độc lập với PromotionType/VoucherType của
 *  schema Marketing (Prompt 034 chỉ tính toán, không quản lý dữ liệu Promotion/Voucher). */
export type DiscountType = 'PERCENT' | 'AMOUNT' | 'FIXED_PRICE' | 'BUY_X_GET_Y';

/** Thứ tự ưu tiên bắt buộc: Manual → Promotion → Voucher → Member (áp dụng tuần tự, mỗi
 *  discount tính trên phần còn lại SAU khi các discount ưu tiên cao hơn đã trừ — cascading). */
export type DiscountSource = 'MANUAL' | 'PROMOTION' | 'VOUCHER' | 'MEMBER';

export const DISCOUNT_PRIORITY: Record<DiscountSource, number> = {
  MANUAL: 0,
  PROMOTION: 1,
  VOUCHER: 2,
  MEMBER: 3,
};

/** 1 dòng trong giỏ hàng — input thuần túy, Discount Engine không tự truy vấn Cart/Product. */
export interface DiscountLineItem {
  productId: string;
  categoryId: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
}

/**
 * 1 đề xuất giảm giá cần áp dụng — do caller (Checkout Engine, Prompt 035) chuẩn bị sẵn từ
 * Promotion/Voucher/Member data thật; Discount Engine chỉ TÍNH TOÁN, không tự tra cứu nguồn.
 */
export interface CandidateDiscount {
  source: DiscountSource;
  type: DiscountType;
  /** PERCENT: % (0-100). AMOUNT: số tiền giảm cố định. FIXED_PRICE: giá cố định mới/đơn vị. */
  value?: number;
  /** Bắt buộc với FIXED_PRICE/BUY_X_GET_Y — sản phẩm mục tiêu của discount. */
  productId?: string;
  /** BUY_X_GET_Y: mua đủ buyQuantity thì được tặng getQuantity (miễn phí). */
  buyQuantity?: number;
  getQuantity?: number;
  /** Trần giảm tối đa (vd: Voucher.maxDiscount) — áp cho PERCENT/AMOUNT nếu có. */
  maxDiscount?: number;
  label?: string;
}

export interface AppliedDiscount {
  source: DiscountSource;
  type: DiscountType;
  label?: string;
  /** Số tiền đã giảm thực tế (Decimal string, 2 chữ số thập phân, luôn >= "0.00"). */
  amount: string;
}

export interface DiscountCalculationResult {
  subtotal: string;
  totalDiscount: string;
  finalTotal: string;
  appliedDiscounts: AppliedDiscount[];
}
