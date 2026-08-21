import { SalesReturnRefundAmountInvalidError } from '../errors/sales-return.errors';
import { assertRefundCapNotExceeded } from './sales-return-refund-cap.policy';

// U7 (T053.06E §15) — công thức cap-check THUẦN, không phụ thuộc Prisma/DB thật. Chứng minh khóa
// FOR UPDATE đóng race concurrency là việc CỦA E2E (E6/E7); test này chỉ chứng minh công thức
// đúng khi nhận dữ liệu cho trước.
describe('assertRefundCapNotExceeded', () => {
  it('không ném lỗi khi activeTotal + requested <= totalAmount', () => {
    expect(() =>
      assertRefundCapNotExceeded({
        refunds: [{ amount: '50000', status: 'COMPLETED' }],
        totalAmount: '150000',
        requestedAmount: 100000,
      }),
    ).not.toThrow();
  });

  it('ném SalesReturnRefundAmountInvalidError khi activeTotal + requested > totalAmount', () => {
    expect(() =>
      assertRefundCapNotExceeded({
        refunds: [{ amount: '100000', status: 'COMPLETED' }],
        totalAmount: '150000',
        requestedAmount: 100000,
      }),
    ).toThrow(SalesReturnRefundAmountInvalidError);
  });

  it('bỏ qua Refund CANCELLED/FAILED khi tính tổng active', () => {
    expect(() =>
      assertRefundCapNotExceeded({
        refunds: [
          { amount: '100000', status: 'FAILED' },
          { amount: '50000', status: 'CANCELLED' },
        ],
        totalAmount: '150000',
        requestedAmount: 100000,
      }),
    ).not.toThrow();
  });

  it('tính cả PENDING/PROCESSING (chưa COMPLETED) vào tổng active', () => {
    expect(() =>
      assertRefundCapNotExceeded({
        refunds: [{ amount: '100000', status: 'PENDING' }],
        totalAmount: '150000',
        requestedAmount: 100000,
      }),
    ).toThrow(SalesReturnRefundAmountInvalidError);
  });

  it('đúng biên: activeTotal + requested === totalAmount (không ném lỗi)', () => {
    expect(() =>
      assertRefundCapNotExceeded({
        refunds: [{ amount: '50000', status: 'COMPLETED' }],
        totalAmount: '150000',
        requestedAmount: 100000,
      }),
    ).not.toThrow();
  });
});
