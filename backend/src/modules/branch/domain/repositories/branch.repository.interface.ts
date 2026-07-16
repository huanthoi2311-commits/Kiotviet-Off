import { BranchEntity, BranchStatus } from '../entities/branch.entity';

export interface CreateBranchInput {
  organizationId: string;
  code: string;
  name: string;
  email?: string | null;
  address?: string | null;
  province?: string | null;
  district?: string | null;
  ward?: string | null;
  phone?: string | null;
  invoicePrefix?: string | null;
  receiptPrefix?: string | null;
  timezone?: string;
  currencyCode?: string;
  managerUserId?: string | null;
  createdBy: string;
}

export interface UpdateBranchInput {
  name?: string;
  email?: string | null;
  address?: string | null;
  province?: string | null;
  district?: string | null;
  ward?: string | null;
  phone?: string | null;
  invoicePrefix?: string | null;
  receiptPrefix?: string | null;
  timezone?: string;
  currencyCode?: string;
  managerUserId?: string | null;
  defaultWarehouseId?: string | null;
  updatedBy: string;
}

export interface BranchSearchParams {
  organizationId: string;
  search?: string;
  status?: BranchStatus;
  page: number;
  limit: number;
}

export interface BranchSearchResult {
  items: BranchEntity[];
  total: number;
  page: number;
  limit: number;
}

export class BranchNotActiveError extends Error {
  constructor(public readonly id: string) {
    super('Chi nhánh không ở trạng thái hoạt động');
  }
}

export class BranchInvoicePrefixConflictError extends Error {
  constructor(public readonly invoicePrefix: string) {
    super(`Tiền tố hóa đơn "${invoicePrefix}" đã được sử dụng trong tổ chức`);
  }
}

/** "Không được Archive Branch nếu còn Warehouse ACTIVE" (SPEC-BRANCH-001 §6). */
export class BranchHasActiveWarehouseError extends Error {
  constructor(public readonly id: string) {
    super('Không thể lưu trữ chi nhánh còn kho đang hoạt động');
  }
}

/** "Organization phải có ít nhất một Branch ACTIVE" (SPEC-BRANCH-001 §6). */
export class BranchOrganizationMinOneActiveError extends Error {
  constructor(public readonly organizationId: string) {
    super('Tổ chức phải có ít nhất một chi nhánh đang hoạt động');
  }
}

export interface IBranchRepository {
  create(input: CreateBranchInput): Promise<BranchEntity>;
  findById(id: string, organizationId: string): Promise<BranchEntity | null>;
  search(params: BranchSearchParams): Promise<BranchSearchResult>;
  update(
    id: string,
    organizationId: string,
    input: UpdateBranchInput,
  ): Promise<BranchEntity>;
  /**
   * Ném BranchNotActiveError (đã Archive), BranchHasActiveWarehouseError (còn Warehouse
   * ACTIVE), hoặc BranchOrganizationMinOneActiveError (là Branch ACTIVE cuối cùng của
   * Organization). Không kiểm tra Shift (Prompt 040 — chưa xây, Volume sau).
   */
  archive(
    id: string,
    organizationId: string,
    archivedBy: string,
  ): Promise<BranchEntity>;
  /** Bỏ isMain của các Branch khác trong CÙNG Organization rồi set true cho id này — 1 transaction. */
  setDefault(
    id: string,
    organizationId: string,
    updatedBy: string,
  ): Promise<BranchEntity>;
  existsByInvoicePrefix(
    organizationId: string,
    invoicePrefix: string,
  ): Promise<boolean>;
  countActiveByOrganization(organizationId: string): Promise<number>;
}

export const BRANCH_REPOSITORY = Symbol('BRANCH_REPOSITORY');
