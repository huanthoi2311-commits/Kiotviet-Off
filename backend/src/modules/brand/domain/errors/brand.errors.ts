/**
 * Lỗi domain dùng chung cho thao tác ghi Brand (T007, SPEC-BRAND-001). Đúng mẫu
 * `category.errors.ts` (T006) — tách khỏi `brand.repository.interface.ts` để tầng Application
 * (`BrandService`) import được bằng `instanceof` và dịch sang HTTP response.
 */

/**
 * Ném khi Optimistic Lock thất bại — `version` gửi lên không khớp `version` hiện tại trong DB,
 * tức Brand vừa bị 1 request khác ghi đè giữa lúc đọc và lúc ghi (SPEC-BRAND-001 §7.1, đúng mẫu
 * `CategoryConcurrencyConflictError`/`ProductConcurrencyConflictError` — ADR-0007).
 */
export class BrandConcurrencyConflictError extends Error {
  constructor(public readonly brandId: string) {
    super(
      `Thương hiệu vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại`,
    );
  }
}
