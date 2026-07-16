/**
 * Lỗi domain dùng chung cho thao tác ghi Unit (T008, SPEC-UNIT-001). Đúng mẫu
 * `brand.errors.ts`/`category.errors.ts` — tách khỏi `unit.repository.interface.ts` để tầng
 * Application (`UnitService`) import được bằng `instanceof` và dịch sang HTTP response.
 */

/**
 * Ném khi Optimistic Lock thất bại — `version` gửi lên không khớp `version` hiện tại trong DB,
 * tức Unit vừa bị 1 request khác ghi đè giữa lúc đọc và lúc ghi (SPEC-UNIT-001 §10.1, đúng mẫu
 * `BrandConcurrencyConflictError`/`CategoryConcurrencyConflictError` — ADR-0007).
 */
export class UnitConcurrencyConflictError extends Error {
  constructor(public readonly unitId: string) {
    super(
      `Đơn vị tính vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại`,
    );
  }
}
