import {
  StockCountEntity,
  StockCountStatus,
} from '../entities/stock-count.entity';

export interface CreateStockCountInput {
  organizationId: string;
  warehouseId: string;
  code: string;
  note?: string | null;
  /** Chỉ cần productId — systemQty được repository tự chụp từ Inventory hiện tại. */
  productIds: string[];
  createdBy: string;
}

export interface StockCountSearchParams {
  organizationId: string;
  search?: string;
  status?: StockCountStatus;
  warehouseId?: string;
  page: number;
  limit: number;
}

export interface StockCountSearchResult {
  items: StockCountEntity[];
  total: number;
  page: number;
  limit: number;
}

export interface CompleteStockCountItemInput {
  itemId: string;
  actualQty: number;
  remark?: string | null;
}

/** Ném khi trạng thái hiện tại (đọc lại trong transaction) không cho phép thao tác. */
export class StockCountStatusConflictError extends Error {
  constructor(public readonly currentStatus: StockCountStatus | null) {
    super(
      `Phiếu kiểm kê đang ở trạng thái ${currentStatus ?? 'không xác định'}, không thể thực hiện thao tác này`,
    );
  }
}

/** Ném khi payload Complete tham chiếu một itemId không thuộc phiếu kiểm kê. */
export class StockCountItemMismatchError extends Error {
  constructor(public readonly itemId: string) {
    super(`Dòng kiểm kê ${itemId} không thuộc phiếu này`);
  }
}

/**
 * T051.02 — Ném bởi `complete()` khi `expectedVersion` (client gửi lên) không khớp `version` hiện
 * tại của StockCount — phiếu đang ở đúng trạng thái COUNTING nhưng vừa bị 1 request khác complete
 * giữa lúc client đọc và lúc gửi thao tác này. `start()` là status-predicate updateMany atomic sẵn,
 * không đụng Inventory, không cần version.
 */
export class StockCountConcurrencyConflictError extends Error {
  constructor(public readonly stockCountId: string) {
    super(
      `Phiếu kiểm kê vừa bị thay đổi bởi giao dịch khác, vui lòng tải lại và thử lại`,
    );
  }
}

export interface IStockCountRepository {
  create(input: CreateStockCountInput): Promise<StockCountEntity>;
  findById(
    id: string,
    organizationId: string,
  ): Promise<StockCountEntity | null>;
  search(params: StockCountSearchParams): Promise<StockCountSearchResult>;
  existsByCode(organizationId: string, code: string): Promise<boolean>;
  /** DRAFT → COUNTING, không sinh Movement. */
  start(
    id: string,
    organizationId: string,
    updatedBy: string,
  ): Promise<StockCountEntity>;
  /**
   * COUNTING → COMPLETED trong 1 transaction. T051.02: Optimistic Lock CAS trên `(id,
   * organizationId, status: COUNTING, version: expectedVersion)` được claim TRƯỚC vòng lặp Inventory
   * — request thua cuộc ném `StockCountConcurrencyConflictError` ngay tại bước claim, KHÔNG chạy
   * vòng lặp Inventory. Request thắng cuộc mới tiếp tục: ghi actualQty/difference cho từng item, và
   * với item có difference ≠ 0, ghi 1 InventoryMovement (COUNT) + đồng bộ Inventory. Không sửa
   * Inventory theo cách nào khác ngoài đường này.
   */
  complete(
    id: string,
    organizationId: string,
    expectedVersion: number,
    items: CompleteStockCountItemInput[],
    updatedBy: string,
  ): Promise<StockCountEntity>;
}

export const STOCK_COUNT_REPOSITORY = Symbol('STOCK_COUNT_REPOSITORY');
