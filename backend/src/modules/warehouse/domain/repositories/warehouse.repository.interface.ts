import {
  WarehouseEntity,
  WarehouseStatus,
  WarehouseType,
} from '../entities/warehouse.entity';

export interface CreateWarehouseInput {
  organizationId: string;
  branchId: string;
  managerId?: string | null;
  code: string;
  name: string;
  type?: WarehouseType;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  description?: string | null;
  status?: WarehouseStatus;
  createdBy: string;
}

export interface UpdateWarehouseInput {
  branchId?: string;
  managerId?: string | null;
  code?: string;
  name?: string;
  type?: WarehouseType;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  description?: string | null;
  status?: WarehouseStatus;
  updatedBy: string;
}

export type WarehouseSortField = 'name' | 'code' | 'createdAt' | 'updatedAt';
export type SortOrder = 'asc' | 'desc';

export interface WarehouseSearchParams {
  organizationId: string;
  search?: string;
  branchId?: string;
  type?: WarehouseType;
  status?: WarehouseStatus;
  page: number;
  limit: number;
  sortBy: WarehouseSortField;
  sortOrder: SortOrder;
}

export interface WarehouseSearchResult {
  items: WarehouseEntity[];
  total: number;
  page: number;
  limit: number;
}

export interface IWarehouseRepository {
  create(input: CreateWarehouseInput): Promise<WarehouseEntity>;
  findById(id: string, organizationId: string): Promise<WarehouseEntity | null>;
  findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<WarehouseEntity | null>;
  update(id: string, input: UpdateWarehouseInput): Promise<WarehouseEntity>;
  softDelete(id: string, deletedBy: string): Promise<void>;
  restore(id: string, restoredBy: string): Promise<void>;
  search(params: WarehouseSearchParams): Promise<WarehouseSearchResult>;
  existsByCode(
    organizationId: string,
    code: string,
    excludeId?: string,
  ): Promise<boolean>;
  /** Còn tồn kho (Inventory.quantity/reservedQty > 0) hoặc còn lịch sử giao dịch (InventoryHistory) tại kho này. */
  hasStockOrTransactions(warehouseId: string): Promise<boolean>;
}

export const WAREHOUSE_REPOSITORY = Symbol('WAREHOUSE_REPOSITORY');
