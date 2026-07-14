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
   * COUNTING → COMPLETED trong 1 transaction: ghi actualQty/difference cho từng item,
   * và với item có difference ≠ 0, ghi 1 InventoryMovement (COUNT) + đồng bộ Inventory.
   * Không sửa Inventory theo cách nào khác ngoài đường này.
   */
  complete(
    id: string,
    organizationId: string,
    items: CompleteStockCountItemInput[],
    updatedBy: string,
  ): Promise<StockCountEntity>;
}

export const STOCK_COUNT_REPOSITORY = Symbol('STOCK_COUNT_REPOSITORY');
