import {
  PurchaseReturnEntity,
  PurchaseReturnReason,
  PurchaseReturnStatus,
} from '../entities/purchase-return.entity';

export interface CreatePurchaseReturnItemInput {
  purchaseItemId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  unitCost: number;
  totalAmount: number;
}

export interface CreatePurchaseReturnInput {
  organizationId: string;
  purchaseOrderId: string;
  supplierId: string;
  code: string;
  reason: PurchaseReturnReason;
  note?: string | null;
  totalAmount: number;
  items: CreatePurchaseReturnItemInput[];
  createdBy: string;
}

export interface PurchaseReturnSearchParams {
  organizationId: string;
  search?: string;
  status?: PurchaseReturnStatus;
  purchaseOrderId?: string;
  supplierId?: string;
  page: number;
  limit: number;
}

export interface PurchaseReturnSearchResult {
  items: PurchaseReturnEntity[];
  total: number;
  page: number;
  limit: number;
}

/** Ném bởi approve/complete/cancel khi trạng thái hiện tại (đọc lại trong transaction) không cho phép thao tác. */
export class PurchaseReturnStatusConflictError extends Error {
  constructor(public readonly currentStatus: PurchaseReturnStatus | null) {
    super(
      `Phiếu trả hàng đang ở trạng thái ${currentStatus ?? 'không xác định'}, không thể thực hiện thao tác này`,
    );
  }
}

/** Ném bởi create() khi tổng số lượng trả (kể cả các phiếu trả trước đó) vượt quá số lượng đã nhận của dòng hàng gốc. */
export class PurchaseReturnExceedsReceivedError extends Error {
  constructor(public readonly purchaseItemId: string) {
    super(
      `Số lượng trả vượt quá số lượng đã nhận của dòng hàng ${purchaseItemId}`,
    );
  }
}

/** Ném bởi complete() khi trả hàng sẽ khiến tồn kho âm và tổ chức không cho phép (Setting inventory.allowNegativeStock). */
export class PurchaseReturnNegativeStockError extends Error {
  constructor(public readonly productId: string) {
    super(
      `Sản phẩm ${productId} sẽ âm tồn kho sau khi trả hàng — tổ chức không cho phép`,
    );
  }
}

export interface IPurchaseReturnRepository {
  /**
   * Tạo phiếu trả (DRAFT). Với mỗi dòng, kiểm tra NGAY TRONG transaction: tổng số lượng
   * đã trả (từ mọi phiếu trả chưa hủy) + số lượng trả mới không được vượt quá
   * receivedQuantity của PurchaseItem gốc — chặn race condition khi tạo nhiều phiếu trả
   * đồng thời cho cùng 1 dòng hàng.
   */
  create(input: CreatePurchaseReturnInput): Promise<PurchaseReturnEntity>;
  findById(
    id: string,
    organizationId: string,
  ): Promise<PurchaseReturnEntity | null>;
  search(
    params: PurchaseReturnSearchParams,
  ): Promise<PurchaseReturnSearchResult>;
  existsByCode(organizationId: string, code: string): Promise<boolean>;
  /** DRAFT → APPROVED — cổng phê duyệt thuần túy, không đụng tồn kho/công nợ. */
  approve(
    id: string,
    organizationId: string,
    updatedBy: string,
  ): Promise<PurchaseReturnEntity>;
  /**
   * APPROVED → COMPLETED trong 1 transaction duy nhất: với mỗi dòng hàng, ghi 1
   * InventoryMovement (RETURN, số lượng âm — Inventory Out) + đồng bộ Inventory (chặn âm
   * tồn kho theo Setting inventory.allowNegativeStock, cùng cơ chế Inventory Adjustment),
   * rồi ghi 1 dòng Debt (type PAYABLE, amount âm — giảm công nợ phải trả NCC). Rollback
   * toàn bộ nếu bất kỳ bước nào lỗi.
   */
  complete(
    id: string,
    organizationId: string,
    updatedBy: string,
  ): Promise<PurchaseReturnEntity>;
  /** [DRAFT, APPROVED] → CANCELLED. Không cho hủy khi đã COMPLETED (đã đụng tồn kho/công nợ). */
  cancel(
    id: string,
    organizationId: string,
    updatedBy: string,
  ): Promise<PurchaseReturnEntity>;
}

export const PURCHASE_RETURN_REPOSITORY = Symbol('PURCHASE_RETURN_REPOSITORY');
