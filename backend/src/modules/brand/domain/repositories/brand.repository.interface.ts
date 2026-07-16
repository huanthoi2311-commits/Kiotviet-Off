import { BrandEntity, BrandStatus } from '../entities/brand.entity';

export interface CreateBrandInput {
  organizationId: string;
  code: string;
  name: string;
  logo?: string | null;
  description?: string | null;
  website?: string | null;
  country?: string | null;
  status?: BrandStatus;
  createdBy: string;
}

export interface UpdateBrandInput {
  code?: string;
  name?: string;
  logo?: string | null;
  description?: string | null;
  website?: string | null;
  country?: string | null;
  status?: BrandStatus;
  updatedBy: string;
}

export type BrandSortField = 'name' | 'code' | 'createdAt';
export type BrandSortOrder = 'asc' | 'desc';

/** SPEC-BRAND-001 §4.1 — chuẩn Query Convention thống nhất Master Data (Decision B02.5/RQ3). */
export interface BrandSearchParams {
  organizationId: string;
  search?: string;
  status?: BrandStatus;
  /** Filter alias tầng business, KHÔNG phải cột schema (Decision RQ1) — true => status=ACTIVE, false => status!=ACTIVE. */
  isActive?: boolean;
  page: number;
  limit: number;
  sortBy: BrandSortField;
  sortOrder: BrandSortOrder;
}

export interface BrandSearchResult {
  items: BrandEntity[];
  total: number;
  page: number;
  limit: number;
}

export interface IBrandRepository {
  create(input: CreateBrandInput): Promise<BrandEntity>;
  findById(id: string, organizationId: string): Promise<BrandEntity | null>;
  findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<BrandEntity | null>;
  /**
   * Optimistic Lock (SPEC-BRAND-001 §7.1, Decision B02.7) — compare-and-swap trên `version`.
   * Ném `BrandConcurrencyConflictError` nếu `expectedVersion` không khớp version hiện tại trong
   * DB (đúng mẫu Product/Category). Luôn tăng `version` khi thành công.
   */
  update(
    id: string,
    expectedVersion: number,
    input: UpdateBrandInput,
  ): Promise<BrandEntity>;
  softDelete(id: string, deletedBy: string): Promise<void>;
  /** SPEC-BRAND-001 §8 (Decision B02.3): luôn trả `status` về `INACTIVE`, không bao giờ trực tiếp ACTIVE. */
  restore(id: string, restoredBy: string): Promise<void>;
  search(params: BrandSearchParams): Promise<BrandSearchResult>;
  existsByCode(
    organizationId: string,
    code: string,
    excludeId?: string,
  ): Promise<boolean>;
}

export const BRAND_REPOSITORY = Symbol('BRAND_REPOSITORY');
