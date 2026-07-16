/**
 * Lỗi domain dùng chung cho thao tác ghi Product (T005, SPEC-PRODUCT-001). Tách khỏi
 * `product.repository.interface.ts` theo đúng mẫu đã dùng ở `inventory.errors.ts` (T004) — các
 * lớp lỗi này cần được import bởi tầng Application (`ProductService`) để bắt bằng `instanceof`
 * và dịch sang HTTP response, kể cả khi Repository trở thành chi tiết nội bộ.
 */

/**
 * Ném khi Optimistic Lock thất bại — `version` gửi lên (client đọc trước đó) không khớp `version`
 * hiện tại trong DB, tức Product vừa bị 1 request khác ghi đè giữa lúc đọc và lúc ghi (SPEC-PRODUCT-001
 * §7.1, đúng mẫu `InventoryConcurrencyConflictError` — ADR-0007). Caller nên yêu cầu client tải lại
 * dữ liệu mới nhất rồi thử lại, không tự động ghi đè.
 */
export class ProductConcurrencyConflictError extends Error {
  constructor(public readonly productId: string) {
    super(
      `Sản phẩm vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại`,
    );
  }
}
