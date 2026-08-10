import {
  PurchaseOrderEntity,
  PurchaseOrderStatus,
} from '../entities/purchase-order.entity';

export interface CreatePurchaseItemInput {
  productId: string;
  warehouseId: string;
  quantity: number;
  unitCost: number;
  discount: number;
  taxAmount: number;
  totalAmount: number;
}

export interface CreatePurchaseOrderInput {
  organizationId: string;
  branchId: string;
  supplierId: string;
  code: string;
  expectedAt?: Date | null;
  totalAmount: number;
  items: CreatePurchaseItemInput[];
  createdBy: string;
}

export interface PurchaseOrderSearchParams {
  organizationId: string;
  search?: string;
  status?: PurchaseOrderStatus;
  supplierId?: string;
  branchId?: string;
  page: number;
  limit: number;
}

export interface PurchaseOrderSearchResult {
  items: PurchaseOrderEntity[];
  total: number;
  page: number;
  limit: number;
}

/** Ném bởi approve/receive/cancel khi trạng thái hiện tại (đọc lại trong transaction) không cho phép thao tác. */
export class PurchaseOrderStatusConflictError extends Error {
  constructor(public readonly currentStatus: PurchaseOrderStatus | null) {
    super(
      `Đơn nhập hàng đang ở trạng thái ${currentStatus ?? 'không xác định'}, không thể thực hiện thao tác này`,
    );
  }
}

/**
 * T051.02 — Ném bởi `receive()` khi `expectedVersion` (client gửi lên) không khớp `version` hiện
 * tại của PurchaseOrder — nghĩa là đơn đang ở đúng trạng thái APPROVED nhưng vừa bị 1 request khác
 * receive/ghi đè giữa lúc client đọc và lúc gửi thao tác này. Optimistic Lock CAS trên chính dòng
 * PurchaseOrder (không còn phụ thuộc vào xung đột tình cờ từ Inventory's own optimistic lock).
 */
export class PurchaseOrderConcurrencyConflictError extends Error {
  constructor(public readonly purchaseOrderId: string) {
    super(
      `Đơn nhập hàng vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại`,
    );
  }
}

export interface IPurchaseOrderRepository {
  create(input: CreatePurchaseOrderInput): Promise<PurchaseOrderEntity>;
  findById(
    id: string,
    organizationId: string,
  ): Promise<PurchaseOrderEntity | null>;
  search(params: PurchaseOrderSearchParams): Promise<PurchaseOrderSearchResult>;
  existsByCode(organizationId: string, code: string): Promise<boolean>;
  /** DRAFT → APPROVED — cổng phê duyệt thuần túy, không sinh Movement/đụng tồn kho. */
  approve(
    id: string,
    organizationId: string,
    updatedBy: string,
  ): Promise<PurchaseOrderEntity>;
  /**
   * APPROVED → RECEIVED trong 1 transaction duy nhất. T051.02: Optimistic Lock CAS trên
   * `(id, organizationId, status: APPROVED, version: expectedVersion)` được yêu cầu (claim) TRƯỚC
   * vòng lặp Inventory — request thua cuộc ném `PurchaseOrderConcurrencyConflictError` ngay tại bước
   * claim, KHÔNG chạy vòng lặp Inventory/Debt (không phụ thuộc vào xung đột tình cờ ở tầng
   * Inventory). Request thắng cuộc mới tiếp tục: với mỗi PurchaseItem, ghi 1 InventoryMovement
   * (PURCHASE) + đồng bộ Inventory (tính lại Average Cost theo unitCost của dòng hàng), cập nhật
   * receivedQuantity = quantity. Rollback toàn bộ (không PurchaseOrder, không Movement nào được ghi)
   * nếu bất kỳ bước nào lỗi.
   */
  receive(
    id: string,
    organizationId: string,
    expectedVersion: number,
    updatedBy: string,
  ): Promise<PurchaseOrderEntity>;
  /**
   * [DRAFT, PENDING, APPROVED] → CANCELLED. Không cho hủy khi đã RECEIVED/COMPLETED
   * (tồn kho đã cập nhật, không tự động hoàn tác — dùng Purchase Return, Prompt 028).
   */
  cancel(
    id: string,
    organizationId: string,
    updatedBy: string,
  ): Promise<PurchaseOrderEntity>;
}

export const PURCHASE_ORDER_REPOSITORY = Symbol('PURCHASE_ORDER_REPOSITORY');
