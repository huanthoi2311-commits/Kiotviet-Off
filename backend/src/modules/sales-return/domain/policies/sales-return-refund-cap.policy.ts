import { Prisma } from '@prisma/client';
import { SalesReturnRefundAmountInvalidError } from '../errors/sales-return.errors';

/** Trạng thái Refund vẫn tính vào "đang chiếm dụng hạn mức hoàn tiền" — CANCELLED/FAILED bị loại
 * (không đổi hành vi so với trước T053.06E). */
export const ACTIVE_REFUND_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED'];

export interface RefundCapCheckInput {
  refunds: { amount: Prisma.Decimal | number | string; status: string }[];
  totalAmount: Prisma.Decimal | number | string;
  requestedAmount: Prisma.Decimal | number | string;
}

/**
 * T053.06E — công thức cap-check THUẦN (không phụ thuộc Prisma transaction/kết nối DB thật) —
 * dùng chung bởi `PrismaSalesReturnRepository.createRefund()` (gọi DƯỚI khóa `FOR UPDATE`, trên
 * dữ liệu đã đọc lại sau khi khóa — Discovery §14/§16) VÀ unit test (U7, không cần DB thật để
 * chứng minh đúng công thức). Việc khóa/đọc-lại-dưới-khóa (phần đóng race concurrency thật) CHỈ
 * chứng minh được qua real-Postgres E2E (E6/E7) — hàm này KHÔNG tự chứng minh race đã đóng, chỉ
 * chứng minh công thức cap đúng khi được gọi với đúng dữ liệu.
 */
export function assertRefundCapNotExceeded(input: RefundCapCheckInput): void {
  const activeTotal = input.refunds
    .filter((refund) => ACTIVE_REFUND_STATUSES.includes(refund.status))
    .reduce((sum, refund) => sum.plus(refund.amount), new Prisma.Decimal(0));
  const requested = new Prisma.Decimal(input.requestedAmount);
  if (
    activeTotal
      .plus(requested)
      .greaterThan(new Prisma.Decimal(input.totalAmount))
  ) {
    throw new SalesReturnRefundAmountInvalidError(requested.toString());
  }
}
