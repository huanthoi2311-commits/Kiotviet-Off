import { Prisma } from '@prisma/client';
import {
  InventoryEntity,
  InventoryMovementEntity,
  InventoryMovementType,
  InventoryReferenceType,
} from '../entities/inventory.entity';

/**
 * Đầu vào duy nhất để thay đổi tồn kho. Không có API/DTO tạo trực tiếp — các module
 * nghiệp vụ tương lai (Purchase, POS, Transfer, Stock Count, Adjustment) gọi hàm này
 * qua INVENTORY_REPOSITORY để ghi Movement + đồng bộ Inventory trong 1 transaction.
 * `quantity` là delta có dấu do caller quyết định (dương = nhập, âm = xuất) — repository
 * không tự suy đoán dấu từ movementType, vì đó là quyết định nghiệp vụ của caller.
 */
export interface RecordMovementInput {
  organizationId: string;
  warehouseId: string;
  productId: string;
  movementType: InventoryMovementType;
  referenceType: InventoryReferenceType;
  referenceId?: string | null;
  quantity: number;
  /** Chỉ có ý nghĩa khi quantity > 0 (nhập kho) — dùng để tính lại Average Cost. */
  unitCost?: number | null;
  remark?: string | null;
  createdBy: string;
}

export interface InventorySearchParams {
  organizationId: string;
  warehouseId?: string;
  productId?: string;
  page: number;
  limit: number;
}

export interface InventorySearchResult {
  items: InventoryEntity[];
  total: number;
  page: number;
  limit: number;
}

export interface MovementSearchParams {
  organizationId: string;
  warehouseId?: string;
  productId?: string;
  movementType?: InventoryMovementType;
  referenceType?: InventoryReferenceType;
  createdFrom?: Date;
  createdTo?: Date;
  page: number;
  limit: number;
}

export interface MovementSearchResult {
  items: InventoryMovementEntity[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Input cho recordSaleMovement (Prompt 035 — POS Checkout) — quantity luôn là số DƯƠNG
 * (số lượng bán ra); repository tự trừ, không nhận delta có dấu như recordMovement().
 */
export interface RecordSaleMovementInput {
  organizationId: string;
  warehouseId: string;
  productId: string;
  quantity: number;
  referenceId?: string | null;
  createdBy: string;
}

/** Ném bởi recordSaleMovement() khi tồn kho không đủ VÀ tổ chức không bật `inventory.allowNegativeStock`. */
export class InventoryInsufficientStockError extends Error {
  constructor(
    public readonly productId: string,
    public readonly available: string,
  ) {
    super(`Không đủ tồn kho cho sản phẩm (còn ${available})`);
  }
}

/**
 * Ném bởi recordSaleMovement() khi optimistic lock thất bại — tồn kho đã bị 1 giao dịch
 * khác ghi đè giữa lúc đọc và lúc ghi (race condition, vd nhiều cashier bán cùng sản phẩm
 * đồng thời). Caller (Checkout Engine) nên rollback toàn bộ transaction và có thể thử lại.
 */
export class InventoryConcurrencyConflictError extends Error {
  constructor(public readonly productId: string) {
    super(
      `Tồn kho sản phẩm vừa bị thay đổi bởi giao dịch khác, vui lòng thử lại`,
    );
  }
}

export interface IInventoryRepository {
  search(params: InventorySearchParams): Promise<InventorySearchResult>;
  getByProduct(
    productId: string,
    organizationId: string,
  ): Promise<InventoryEntity[]>;
  getHistory(params: MovementSearchParams): Promise<MovementSearchResult>;
  recordMovement(input: RecordMovementInput): Promise<InventoryMovementEntity>;
  /**
   * Xuất kho cho bán hàng (SALE/POS) với Optimistic Lock — UPDATE có điều kiện
   * `WHERE quantity = <giá trị vừa đọc>`, nếu 0 dòng bị ảnh hưởng nghĩa là tồn kho đã đổi
   * do giao dịch khác chạy chen giữa → ném InventoryConcurrencyConflictError thay vì ghi
   * đè mù. Tôn trọng setting `inventory.allowNegativeStock` giống Purchase Return/Adjustment.
   * `tx` tùy chọn — truyền vào khi cần gộp chung 1 Prisma transaction lớn hơn (Checkout
   * Engine, Prompt 035); không truyền thì tự mở transaction riêng như mọi method khác.
   */
  recordSaleMovement(
    input: RecordSaleMovementInput,
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryMovementEntity>;
}

export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');
