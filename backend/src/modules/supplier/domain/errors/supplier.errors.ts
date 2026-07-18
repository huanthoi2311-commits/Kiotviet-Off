/**
 * Lỗi domain dùng chung cho thao tác ghi Supplier (T012, SPEC-T012-SUPPLIER-001). Đúng mẫu
 * `customer.errors.ts`/`barcode.errors.ts` — tách khỏi `supplier.repository.interface.ts` để tầng
 * Application (`SupplierService`) import được bằng `instanceof` và dịch sang HTTP response.
 */

/**
 * Ném khi Optimistic Lock thất bại — `version` gửi lên không khớp `version` hiện tại trong DB
 * (BR09 — áp dụng cho Update/Activate/Deactivate/Archive/Restore).
 */
export class SupplierConcurrencyConflictError extends Error {
  constructor(public readonly supplierId: string) {
    super(
      `Nhà cung cấp vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại`,
    );
  }
}
