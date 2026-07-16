/**
 * Lỗi domain dùng chung cho thao tác ghi Category (T006, SPEC-CATEGORY-001). Đúng mẫu
 * `product.errors.ts` (T005) — tách khỏi `category.repository.interface.ts` để tầng Application
 * (`CategoryService`) import được bằng `instanceof` và dịch sang HTTP response.
 */

/**
 * Ném khi Optimistic Lock thất bại — `version` gửi lên không khớp `version` hiện tại trong DB,
 * tức Category vừa bị 1 request khác ghi đè giữa lúc đọc và lúc ghi (SPEC-CATEGORY-001 §7.1,
 * đúng mẫu `ProductConcurrencyConflictError` — ADR-0007).
 */
export class CategoryConcurrencyConflictError extends Error {
  constructor(public readonly categoryId: string) {
    super(
      `Danh mục vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại`,
    );
  }
}
