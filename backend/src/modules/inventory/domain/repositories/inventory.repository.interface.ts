import { Prisma } from '@prisma/client';
import {
  InventoryEntity,
  InventoryMovementEntity,
  InventoryMovementType,
  InventoryReferenceType,
} from '../entities/inventory.entity';

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
 * Đầu vào DUY NHẤT để thay đổi tồn kho (SPEC-INV-001, T004) — chỉ được gọi bởi
 * `InventoryDomainService`, không phải trực tiếp bởi module nghiệp vụ khác. `quantity` là
 * delta có dấu do caller quyết định (dương = nhập, âm = xuất) — repository không tự suy đoán
 * dấu từ movementType. `checkNegativeStock` do `InventoryDomainService` quyết định theo từng
 * loại thao tác (increase/transfer-in: false; decrease/transfer-out: true; adjust: theo
 * movementType) — repository chỉ thực thi, không tự quyết định policy khi nào cần check.
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
  /** Có kiểm tra Setting `inventory.allowNegativeStock` trước khi cho phép quantity < 0 hay không. */
  checkNegativeStock: boolean;
  createdBy: string;
}

/**
 * `avgCostAfter` không phải field của bảng `inventory_movements` (không lưu DB) — chỉ trả về
 * ngay tại thời điểm ghi, cho caller cần biết giá vốn hiện hành sau movement (vd Transfer
 * snapshot avgCost của kho nguồn vào `TransferItem.unitCost` để dùng khi ghi nhận kho đích).
 */
export interface RecordMovementResult {
  movement: InventoryMovementEntity;
  avgCostAfter: string;
}

/**
 * Repository là chi tiết triển khai NỘI BỘ của Inventory Module (Decision 8, SPEC-INV-001) —
 * không được inject bởi bất kỳ module nào khác. Module khác chỉ được gọi qua
 * `InventoryDomainService` (xem `application/inventory-domain.service.ts`).
 */
export interface IInventoryRepository {
  search(params: InventorySearchParams): Promise<InventorySearchResult>;
  getByProduct(
    productId: string,
    organizationId: string,
  ): Promise<InventoryEntity[]>;
  getHistory(params: MovementSearchParams): Promise<MovementSearchResult>;
  /**
   * Điểm ghi duy nhất cho mọi biến động tồn kho — luôn dùng Optimistic Lock (compare-and-swap
   * `UPDATE ... WHERE quantity = <giá trị vừa đọc>`, xem `inventory-locking-strategy.md`).
   * `tx` BẮT BUỘC (Decision 5, SPEC-INV-001 Revision) — hàm này tuyệt đối KHÔNG tự mở
   * transaction, không commit, không rollback; toàn bộ transaction do caller quản lý.
   */
  recordMovement(
    tx: Prisma.TransactionClient,
    input: RecordMovementInput,
  ): Promise<RecordMovementResult>;
}

export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');
