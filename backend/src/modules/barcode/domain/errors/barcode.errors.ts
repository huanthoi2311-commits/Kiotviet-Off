/**
 * Lỗi domain dùng chung cho thao tác ghi Barcode (T009, SPEC-BARCODE-001). Đúng mẫu
 * `unit.errors.ts`/`brand.errors.ts` — tách khỏi `barcode.repository.interface.ts` để tầng
 * Application (`BarcodeService`) import được bằng `instanceof` và dịch sang HTTP response.
 */

/**
 * Ném khi Optimistic Lock thất bại — `version` gửi lên không khớp `version` hiện tại trong DB
 * (SPEC-BARCODE-001 §9.1, Decision BQ10/SB02 — áp dụng cho `update`/`softDelete`/`restore`/
 * `setDefault`, không chỉ `PATCH` như mặc định chuẩn dự án).
 */
export class BarcodeConcurrencyConflictError extends Error {
  constructor(public readonly barcodeId: string) {
    super(
      `Mã vạch vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại`,
    );
  }
}
