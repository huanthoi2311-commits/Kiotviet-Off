import { UnitEntity, UnitStatus } from '../entities/unit.entity';

export interface CreateUnitInput {
  organizationId: string;
  code: string;
  name: string;
  symbol: string;
  status?: UnitStatus;
  createdBy: string;
}

export interface UpdateUnitInput {
  code?: string;
  name?: string;
  symbol?: string;
  status?: UnitStatus;
  updatedBy: string;
}

export type UnitSortField = 'name' | 'code' | 'createdAt';
export type UnitSortOrder = 'asc' | 'desc';

/** SPEC-UNIT-001 §4.1 — chuẩn Query Convention thống nhất Master Data (Decision RQ7/UP01). */
export interface UnitSearchParams {
  organizationId: string;
  search?: string;
  status?: UnitStatus;
  /** Filter alias tầng business, KHÔNG phải cột schema (Decision RQ1 gốc Brand, SU04). */
  isActive?: boolean;
  page: number;
  limit: number;
  sortBy: UnitSortField;
  sortOrder: UnitSortOrder;
}

export interface UnitSearchResult {
  items: UnitEntity[];
  total: number;
  page: number;
  limit: number;
}

export interface IUnitRepository {
  create(input: CreateUnitInput): Promise<UnitEntity>;
  findById(id: string, organizationId: string): Promise<UnitEntity | null>;
  findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<UnitEntity | null>;
  /**
   * Optimistic Lock (SPEC-UNIT-001 §10.1, Decision RQ2) — compare-and-swap trên `version`. Ném
   * `UnitConcurrencyConflictError` nếu `expectedVersion` không khớp version hiện tại trong DB.
   * Decision SU03/UP06 — `organizationId` bắt buộc trong `where`, khác Product/Category/Brand
   * hiện tại (chưa đổi, chờ đúng Sprint riêng của từng module).
   */
  update(
    id: string,
    organizationId: string,
    expectedVersion: number,
    input: UpdateUnitInput,
  ): Promise<UnitEntity>;
  softDelete(
    id: string,
    organizationId: string,
    deletedBy: string,
  ): Promise<void>;
  /** SPEC-UNIT-001 §9 (Decision RQ3): luôn trả `status` về `INACTIVE`, không bao giờ trực tiếp ACTIVE. */
  restore(
    id: string,
    organizationId: string,
    restoredBy: string,
  ): Promise<void>;
  search(params: UnitSearchParams): Promise<UnitSearchResult>;
  /** Reserved API (Decision SU02) — phục vụ Import Excel/Bulk Import/API Validation/ERP Integration sau này. */
  existsByCode(
    organizationId: string,
    code: string,
    excludeId?: string,
  ): Promise<boolean>;
}

export const UNIT_REPOSITORY = Symbol('UNIT_REPOSITORY');
