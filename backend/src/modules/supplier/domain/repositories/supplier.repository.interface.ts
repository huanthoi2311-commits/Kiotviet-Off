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
  findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<SupplierEntity | null>;
  update(id: string, input: UpdateSupplierInput): Promise<SupplierEntity>;
  softDelete(id: string, deletedBy: string): Promise<void>;
  restore(id: string, restoredBy: string): Promise<void>;
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
