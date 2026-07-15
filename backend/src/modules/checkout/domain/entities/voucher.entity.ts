export type VoucherType = 'PERCENTAGE' | 'FIXED_AMOUNT';
export type VoucherStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED';

/**
 * Đọc nội bộ Checkout Engine (Prompt 035) — không phải Voucher Module đầy đủ (chưa có CRUD,
 * quy hoạch Volume sau). Chỉ đủ để validate + áp dụng 1 mã giảm giá lúc Checkout.
 */
export interface VoucherEntity {
  id: string;
  code: string;
  type: VoucherType;
  value: string;
  minOrderAmount: string | null;
  maxDiscount: string | null;
  usageLimit: number | null;
  usedCount: number;
  startDate: Date;
  endDate: Date;
  status: VoucherStatus;
}
