import type {
  InventoryMovementType,
  InventoryReferenceType,
} from '../../../inventory/domain/entities/inventory.entity';
import { TransferEntity, TransferStatus } from '../entities/transfer.entity';

export interface CreateTransferItemInput {
  productId: string;
  quantity: number;
}

export interface CreateTransferInput {
  organizationId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  code: string;
  note?: string | null;
  items: CreateTransferItemInput[];
  createdBy: string;
}

export interface TransferSearchParams {
  organizationId: string;
  search?: string;
  status?: TransferStatus;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  page: number;
  limit: number;
}

export interface TransferSearchResult {
  items: TransferEntity[];
  total: number;
  page: number;
  limit: number;
}

/** Một dòng InventoryMovement cần ghi khi chuyển trạng thái (approve/receive/cancel-with-reversal). */
export interface TransferMovementInput {
  transferItemId: string;
  warehouseId: string;
  productId: string;
  /** Delta có dấu (dương = nhập, âm = xuất) — do TransferService quyết định theo hướng nghiệp vụ. */
  quantity: number;
  unitCost?: number | null;
  movementType: InventoryMovementType;
  referenceType: InventoryReferenceType;
  /**
   * Chỉ dùng khi Approve: ghi lại Average Cost CỦA KHO NGUỒN tại thời điểm này (trước
   * khi trừ) vào TransferItem.unitCost, để Receive mang đúng giá vốn sang Kho đích.
   */
  captureUnitCostToItem?: boolean;
}

/** Ném bởi transitionStatus() khi trạng thái hiện tại (đọc lại trong transaction) không khớp expectedStatuses. */
export class TransferStatusConflictError extends Error {
  constructor(public readonly currentStatus: TransferStatus) {
    super(
      `Transfer đang ở trạng thái ${currentStatus}, không thể thực hiện thao tác này`,
    );
  }
}

export interface ITransferRepository {
  create(input: CreateTransferInput): Promise<TransferEntity>;
  findById(id: string, organizationId: string): Promise<TransferEntity | null>;
  search(params: TransferSearchParams): Promise<TransferSearchResult>;
  existsByCode(organizationId: string, code: string): Promise<boolean>;
  /**
   * Chuyển trạng thái + ghi các InventoryMovement liên quan trong 1 transaction duy
   * nhất (rollback toàn bộ nếu bất kỳ bước nào lỗi — đúng yêu cầu Prompt 023). Trạng
   * thái hiện tại được đọc lại NGAY TRONG transaction và so với expectedStatuses để
   * tránh race condition (2 request approve cùng lúc); nếu không khớp, ném
   * TransferStatusConflictError.
   */
  transitionStatus(
    id: string,
    expectedStatuses: TransferStatus[],
    nextStatus: TransferStatus,
    movements: TransferMovementInput[],
    updatedBy: string,
  ): Promise<TransferEntity>;
}

export const TRANSFER_REPOSITORY = Symbol('TRANSFER_REPOSITORY');
