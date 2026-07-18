/**
 * Lỗi domain dùng chung cho thao tác ghi Customer (T011, SPEC-T011-CUSTOMER-001). Đúng mẫu
 * `barcode.errors.ts`/`unit.errors.ts` — tách khỏi `customer.repository.interface.ts` để tầng
 * Application (`CustomerService`) import được bằng `instanceof` và dịch sang HTTP response.
 */

/**
 * Ném khi Optimistic Lock thất bại — `version` gửi lên không khớp `version` hiện tại trong DB
 * (BR09 — áp dụng cho Update/Activate/Deactivate/Archive/Restore).
 */
export class CustomerConcurrencyConflictError extends Error {
  constructor(public readonly customerId: string) {
    super(
      `Khách hàng vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại`,
    );
  }
}
