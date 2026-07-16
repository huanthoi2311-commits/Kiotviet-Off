/**
 * Lỗi domain dùng chung cho mọi thao tác ghi Inventory qua InventoryDomainService (T004,
 * SPEC-INV-001). Tách khỏi `inventory.repository.interface.ts` vì Repository trở thành chi
 * tiết nội bộ của Inventory Module (không export ra ngoài — Decision 8), nhưng các lớp lỗi
 * này vẫn cần được import bởi module khác (Checkout, Purchase Return, Inventory Adjustment,
 * Transfer, Stock Count, Purchase Order) để bắt lỗi bằng `instanceof` và dịch sang HTTP response.
 */

/** Ném khi tồn kho không đủ VÀ tổ chức không bật `inventory.allowNegativeStock`. */
export class InventoryInsufficientStockError extends Error {
  constructor(
    public readonly productId: string,
    public readonly available: string,
  ) {
    super(`Không đủ tồn kho cho sản phẩm (còn ${available})`);
  }
}

/**
 * Ném khi Optimistic Lock thất bại — tồn kho đã bị 1 giao dịch khác ghi đè giữa lúc đọc và
 * lúc ghi (race condition, vd nhiều thao tác cùng chạm 1 sản phẩm/kho đồng thời). Caller nên
 * rollback toàn bộ transaction của chính mình và có thể thử lại.
 */
export class InventoryConcurrencyConflictError extends Error {
  constructor(public readonly productId: string) {
    super(
      `Tồn kho sản phẩm vừa bị thay đổi bởi giao dịch khác, vui lòng thử lại`,
    );
  }
}
