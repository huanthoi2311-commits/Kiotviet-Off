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

export interface IInventoryRepository {
  search(params: InventorySearchParams): Promise<InventorySearchResult>;
  getByProduct(
    productId: string,
    organizationId: string,
  ): Promise<InventoryEntity[]>;
  getHistory(params: MovementSearchParams): Promise<MovementSearchResult>;
  recordMovement(input: RecordMovementInput): Promise<InventoryMovementEntity>;
}

export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');
