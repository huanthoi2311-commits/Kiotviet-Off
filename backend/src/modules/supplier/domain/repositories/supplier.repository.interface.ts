import { SupplierEntity, SupplierStatus } from '../entities/supplier.entity';

export interface SupplierFieldsInput {
  code: string;
  taxCode?: string | null;
  companyName: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  province?: string | null;
  district?: string | null;
  ward?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  paymentTerm?: number | null;
  creditLimit?: number | null;
  /**
   * CHỈ có tác dụng trong `importBatch()` (Excel Import, Decision SR04 — giữ nguyên 100%).
   * `create()`/`update()` (API thường) KHÔNG đọc field này — status luôn `ACTIVE` khi tạo qua
   * API, đổi qua route Activate/Deactivate/Archive/Restore riêng (SPEC-T012-SUPPLIER-001 §5).
   */
  status?: SupplierStatus;
  note?: string | null;
}

export interface CreateSupplierInput extends SupplierFieldsInput {
  organizationId: string;
  createdBy: string;
}

export interface UpdateSupplierInput extends Partial<SupplierFieldsInput> {
  updatedBy: string;
}

export type SupplierSortField =
  'code' | 'companyName' | 'createdAt' | 'updatedAt';
export type SortOrder = 'asc' | 'desc';

export interface SupplierSearchParams {
  organizationId: string;
  search?: string;
  status?: SupplierStatus;
  province?: string;
  page: number;
  limit: number;
  sortBy: SupplierSortField;
  sortOrder: SortOrder;
}

export interface SupplierSearchResult {
  items: SupplierEntity[];
  total: number;
  page: number;
  limit: number;
}

/** Một dòng đã qua validate, sẵn sàng ghi trong importBatch(). */
export interface ImportSupplierRow extends SupplierFieldsInput {
  rowNumber: number;
}

export interface ImportSupplierResult {
  createdCount: number;
  updatedCount: number;
}

export interface ISupplierRepository {
  create(input: CreateSupplierInput): Promise<SupplierEntity>;
  findById(id: string, organizationId: string): Promise<SupplierEntity | null>;
  findByCode(
    organizationId: string,
    code: string,
  ): Promise<SupplierEntity | null>;
  findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<SupplierEntity | null>;
  update(
    id: string,
    organizationId: string,
    expectedVersion: number,
    input: UpdateSupplierInput,
  ): Promise<SupplierEntity>;
  /** Dùng chung Activate/Deactivate (SPEC §4.2) — set `status` + tăng `version`. */
  changeStatusWithVersion(
    id: string,
    organizationId: string,
    expectedVersion: number,
    status: SupplierStatus,
    updatedBy: string,
  ): Promise<SupplierEntity>;
  softDelete(
    id: string,
    organizationId: string,
    expectedVersion: number,
    deletedBy: string,
  ): Promise<void>;
  restore(
    id: string,
    organizationId: string,
    expectedVersion: number,
    restoredBy: string,
  ): Promise<void>;
  search(params: SupplierSearchParams): Promise<SupplierSearchResult>;
  /** Không phân trang — dùng cho Export Excel (áp cùng bộ lọc với search, không giới hạn số dòng). */
  findAllForExport(
    params: Omit<SupplierSearchParams, 'page' | 'limit'>,
  ): Promise<SupplierEntity[]>;
  existsByCode(
    organizationId: string,
    code: string,
    excludeId?: string,
  ): Promise<boolean>;
  hasPurchaseOrders(supplierId: string): Promise<boolean>;
  /**
   * Ghi toàn bộ các dòng đã validate trong 1 transaction (upsert theo code — có thì
   * update, chưa có thì tạo mới). Rollback toàn bộ nếu bất kỳ dòng nào lỗi khi ghi.
   */
  importBatch(
    organizationId: string,
    rows: ImportSupplierRow[],
    actorId: string,
  ): Promise<ImportSupplierResult>;
}

export const SUPPLIER_REPOSITORY = Symbol('SUPPLIER_REPOSITORY');
