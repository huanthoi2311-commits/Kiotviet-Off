/** SPEC-T014-SALES-RETURN-EXCHANGE-001 §Error Model (RFC-T014 v1.1 §33). */

export class SalesReturnNotFoundError extends Error {
  constructor(public readonly id: string) {
    super('Không tìm thấy phiếu trả hàng');
  }
}

export class SalesReturnInvoiceNotEligibleError extends Error {
  constructor(public readonly invoiceId: string) {
    super('Hóa đơn không đủ điều kiện để trả hàng');
  }
}

export class SalesReturnInvoiceItemNotFoundError extends Error {
  constructor(public readonly invoiceItemId: string) {
    super('Dòng hàng không thuộc hóa đơn này');
  }
}

/** Ném khi validate SƠ BỘ (Create/Update/Submit/Approve) — không phải nguồn sự thật cuối cùng. */
export class SalesReturnQtyExceededError extends Error {
  constructor(
    public readonly invoiceItemId: string,
    public readonly eligibleQty: string,
  ) {
    super(`Số lượng trả vượt quá số lượng còn lại có thể trả (${eligibleQty})`);
  }
}

export class SalesReturnInvalidTransitionError extends Error {
  constructor(
    public readonly from: string | null,
    public readonly to: string,
  ) {
    super(
      `Không thể chuyển trạng thái phiếu trả hàng từ "${from}" sang "${to}"`,
    );
  }
}

/** Optimistic Lock trên chính SalesReturn document (Decision AD41) — KHÔNG phải AD44. */
export class SalesReturnVersionConflictError extends Error {
  constructor(public readonly id: string) {
    super(
      'Phiếu trả hàng đã bị thay đổi bởi một thao tác khác, vui lòng tải lại',
    );
  }
}

/**
 * Ném khi bước RECEIVED gặp deadlock/lock-timeout trên InvoiceItem serialization boundary
 * (Decision AD44, SPEC §13) — KHÔNG phải Optimistic Lock. Client tự retry (không có internal
 * retry loop trong dự án, SPEC §0 OQ4).
 */
export class SalesReturnConcurrencyRetryError extends Error {
  constructor(public readonly invoiceItemIds: string[]) {
    super('Đang có phiếu trả hàng khác xử lý cùng dòng hàng, vui lòng thử lại');
  }
}

export class SalesReturnServiceItemInventoryForbiddenError extends Error {
  constructor(public readonly productId: string) {
    super('Sản phẩm dịch vụ (SERVICE) không phục hồi tồn kho');
  }
}

export class SalesReturnRefundNotFoundError extends Error {
  constructor(public readonly id: string) {
    super('Không tìm thấy giao dịch hoàn tiền');
  }
}

/**
 * Phase 4 — Refund chỉ được tạo khi SalesReturn đã ở RECEIVED hoặc COMPLETED (đã thực nhận hàng
 * trả về). RFC/SPEC không nêu rõ điều kiện tiên quyết này bằng câu chữ tường minh — đây là một
 * quyết định kỹ thuật trong phạm vi (disclosed): tạo Refund cho một Return chưa từng nhận hàng
 * không có cơ sở nghiệp vụ (chưa xác nhận đã lấy lại hàng thì chưa có gì để hoàn tiền tương ứng).
 */
export class SalesReturnNotReceivedForRefundError extends Error {
  constructor(
    public readonly salesReturnId: string,
    public readonly status: string,
  ) {
    super(
      `Chỉ có thể tạo hoàn tiền khi phiếu trả hàng đã RECEIVED hoặc COMPLETED (hiện tại: ${status})`,
    );
  }
}

export class SalesReturnRefundAmountInvalidError extends Error {
  constructor(public readonly amount: string) {
    super(
      'Số tiền hoàn không hợp lệ, vượt quá giá trị có thể hoàn của phiếu trả hàng',
    );
  }
}

export class SalesReturnRefundInvalidTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Không thể chuyển trạng thái hoàn tiền từ "${from}" sang "${to}"`);
  }
}

export class SalesReturnRefundVersionConflictError extends Error {
  constructor(public readonly id: string) {
    super(
      'Giao dịch hoàn tiền đã bị thay đổi bởi một thao tác khác, vui lòng tải lại',
    );
  }
}
