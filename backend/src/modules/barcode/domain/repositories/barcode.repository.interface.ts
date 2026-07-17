import {
  BarcodeEntity,
  BarcodeStatus,
  BarcodeType,
} from '../entities/barcode.entity';

export interface CreateBarcodeInput {
  productId: string;
  organizationId: string;
  unitId?: string | null;
  code: string;
  type: BarcodeType;
  isDefault?: boolean;
  status?: BarcodeStatus;
  createdBy: string;
}

export interface UpdateBarcodeInput {
  code?: string;
  type?: BarcodeType;
  unitId?: string | null;
  status?: BarcodeStatus;
  updatedBy: string;
}

export type BarcodeSortField = 'code' | 'createdAt';
export type BarcodeSortOrder = 'asc' | 'desc';

/** SPEC-BARCODE-001 §4.3 — Query Convention org-wide cho GET /barcodes (Decision BQ1/SB08/SB09). */
export interface BarcodeSearchParams {
  organizationId: string;
  search?: string;
  status?: BarcodeStatus;
  /** Filter alias tầng business, KHÔNG phải cột schema (Decision SB04 gốc Brand). */
  isActive?: boolean;
  page: number;
  limit: number;
  sortBy: BarcodeSortField;
  sortOrder: BarcodeSortOrder;
}

export interface BarcodeSearchResult {
  items: BarcodeEntity[];
  total: number;
  page: number;
  limit: number;
}

export interface IBarcodeRepository {
  create(input: CreateBarcodeInput): Promise<BarcodeEntity>;
  findById(id: string, organizationId: string): Promise<BarcodeEntity | null>;
  findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<BarcodeEntity | null>;
  listByProduct(
    productId: string,
    organizationId: string,
  ): Promise<BarcodeEntity[]>;
  /** SPEC-BARCODE-001 §4.2 — tra cứu org-wide cho GET /barcodes. */
  search(params: BarcodeSearchParams): Promise<BarcodeSearchResult>;
  /**
   * Optimistic Lock (SPEC-BARCODE-001 §9.1, Decision BQ10/SB02) — compare-and-swap trên
   * `version`. Ném `BarcodeConcurrencyConflictError` nếu `expectedVersion` không khớp.
   */
  update(
    id: string,
    organizationId: string,
    expectedVersion: number,
    input: UpdateBarcodeInput,
  ): Promise<BarcodeEntity>;
  softDelete(
    id: string,
    organizationId: string,
    expectedVersion: number,
    deletedBy: string,
  ): Promise<void>;
  /** SPEC-BARCODE-001 §4.1 (Decision BQ3): luôn trả status về INACTIVE, không bao giờ trực tiếp ACTIVE. */
  restore(
    id: string,
    organizationId: string,
    expectedVersion: number,
    restoredBy: string,
  ): Promise<void>;
  setDefault(
    id: string,
    organizationId: string,
    productId: string,
    expectedVersion: number,
    updatedBy: string,
  ): Promise<BarcodeEntity>;
  /** Reserved API trước T009 (Decision SB02 gốc Unit) — nay wiring thật theo Decision BQ6. */
  existsByCode(
    organizationId: string,
    code: string,
    excludeId?: string,
  ): Promise<boolean>;
  /** SPEC-UNIT-001 §8 (Decision RQ5) — dùng cho Delete Guard của Unit qua BarcodeDomainService. */
  hasActiveBarcodesInUnit(unitId: string): Promise<boolean>;
}

export const BARCODE_REPOSITORY = Symbol('BARCODE_REPOSITORY');
