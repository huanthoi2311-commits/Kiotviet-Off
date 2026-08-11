import {
  InventoryAdjustmentEntity,
  InventoryAdjustmentReason,
  InventoryAdjustmentStatus,
} from '../entities/inventory-adjustment.entity';

export interface CreateInventoryAdjustmentItemInput {
  productId: string;
  quantity: number;
  remark?: string | null;
}

export interface CreateInventoryAdjustmentInput {
  organizationId: string;
  warehouseId: string;
  code: string;
  reason: InventoryAdjustmentReason;
  note?: string | null;
  items: CreateInventoryAdjustmentItemInput[];
  createdBy: string;
}

export interface InventoryAdjustmentSearchParams {
  organizationId: string;
  search?: string;
  status?: InventoryAdjustmentStatus;
  warehouseId?: string;
  reason?: InventoryAdjustmentReason;
  page: number;
  limit: number;
}

export interface InventoryAdjustmentSearchResult {
  items: InventoryAdjustmentEntity[];
  total: number;
  page: number;
  limit: number;
}

/** Ném khi trạng thái hiện tại (đọc lại lúc ghi) không cho phép thao tác. */
export class InventoryAdjustmentStatusConflictError extends Error {
  constructor(public readonly currentStatus: InventoryAdjustmentStatus | null) {
    super(
      `Phiếu điều chỉnh đang ở trạng thái ${currentStatus ?? 'không xác định'}, không thể thực hiện thao tác này`,
    );
  }
}

/** Ném khi Complete sẽ khiến tồn kho âm và tổ chức không cho phép (Setting inventory.allowNegativeStock). */
export class InventoryAdjustmentNegativeStockError extends Error {
  constructor(public readonly productId: string) {
    super(
      `Sản phẩm ${productId} sẽ âm tồn kho sau điều chỉnh — tổ chức không cho phép`,
    );
  }
}

/**
 * T051.02 — Ném bởi `complete()` khi `expectedVersion` (client gửi lên) không khớp `version` hiện
 * tại của InventoryAdjustment — phiếu đang ở đúng trạng thái APPROVED nhưng vừa bị 1 request khác
 * complete giữa lúc client đọc và lúc gửi thao tác này. submit/approve không đụng Inventory nên vẫn
 * dùng status-predicate updateMany, không cần version.
 */
export class InventoryAdjustmentConcurrencyConflictError extends Error {
  constructor(public readonly inventoryAdjustmentId: string) {
    super(
      `Phiếu điều chỉnh vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại`,
    );
  }
}

export interface IInventoryAdjustmentRepository {
  create(
    input: CreateInventoryAdjustmentInput,
  ): Promise<InventoryAdjustmentEntity>;
  findById(
    id: string,
    organizationId: string,
  ): Promise<InventoryAdjustmentEntity | null>;
  search(
    params: InventoryAdjustmentSearchParams,
  ): Promise<InventoryAdjustmentSearchResult>;
  existsByCode(organizationId: string, code: string): Promise<boolean>;
  /** DRAFT → SUBMITTED, không sinh Movement. */
  submit(
    id: string,
    organizationId: string,
    updatedBy: string,
  ): Promise<InventoryAdjustmentEntity>;
  /** SUBMITTED → APPROVED, không sinh Movement (cổng phê duyệt thuần túy). */
  approve(
    id: string,
    organizationId: string,
    updatedBy: string,
  ): Promise<InventoryAdjustmentEntity>;
  /**
   * APPROVED → COMPLETED trong 1 transaction. T051.02: Optimistic Lock CAS trên `(id,
   * organizationId, status: APPROVED, version: expectedVersion)` được claim TRƯỚC vòng lặp Inventory
   * — request thua cuộc ném `InventoryAdjustmentConcurrencyConflictError` ngay tại bước claim,
   * KHÔNG chạy vòng lặp Inventory. Request thắng cuộc mới tiếp tục: với mỗi item, kiểm tra cấu hình
   * "không âm tồn kho" (nếu bật), ghi 1 InventoryMovement (ADJUSTMENT) + đồng bộ Inventory. Rollback
   * toàn bộ nếu bất kỳ item nào vi phạm cấu hình.
   */
  complete(
    id: string,
    organizationId: string,
    expectedVersion: number,
    updatedBy: string,
  ): Promise<InventoryAdjustmentEntity>;
}

export const INVENTORY_ADJUSTMENT_REPOSITORY = Symbol(
  'INVENTORY_ADJUSTMENT_REPOSITORY',
);
