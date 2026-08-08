/**
 * Lỗi domain dùng cho thao tác ghi Product Price Set (T043.07, SPEC-T043.07 §8/§9). Tách khỏi
 * `product-price.repository.interface.ts` theo đúng mẫu `product.errors.ts`/`inventory.errors.ts`
 * (T004/T005) — cần được `ProductPriceService` bắt bằng `instanceof` và dịch sang HTTP response.
 */

/**
 * Ném khi Optimistic Lock thất bại — `priceVersion` gửi lên không khớp `Product.priceVersion`
 * hiện tại trong DB, tức price set vừa bị 1 request khác ghi đè giữa lúc đọc và lúc ghi
 * (SPEC-T043.07 §4, Architect Decision T043.06 §2 — version riêng cho toàn bộ price set, tách
 * khỏi `Product.version`).
 */
export class ProductPriceConcurrencyConflictError extends Error {
  constructor(public readonly productId: string) {
    super(
      `Bảng giá sản phẩm vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại`,
    );
  }
}
