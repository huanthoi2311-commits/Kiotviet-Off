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
  /** Số lượng, luôn dương — chiều xử lý do `direction` quyết định. */
  quantity: number;
  unitCost?: number | null;
  /**
   * OUT = trừ kho (Approve — kiểm tra âm kho, Decision 9 SPEC-INV-001). IN = cộng kho
   * (Receive, hoặc hoàn trả kho nguồn khi Cancel một phiếu đã Approve — không kiểm tra).
   */
  direction: 'OUT' | 'IN';
  /**
   * Chỉ dùng khi direction=OUT (Approve): ghi lại Average Cost CỦA KHO NGUỒN tại thời điểm
   * này vào TransferItem.unitCost, để Receive mang đúng giá vốn sang Kho đích.
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

/** Ném bởi transitionStatus() khi Approve (trừ kho nguồn) sẽ làm âm kho và Setting không cho phép (Decision 9, SPEC-INV-001). */
export class TransferNegativeStockError extends Error {
  constructor(public readonly productId: string) {
    super(`Không đủ tồn kho ở kho nguồn cho sản phẩm (productId=${productId})`);
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
