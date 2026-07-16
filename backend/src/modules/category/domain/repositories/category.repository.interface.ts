import { CategoryEntity, CategoryStatus } from '../entities/category.entity';

export interface CreateCategoryInput {
  organizationId: string;
  parentId?: string | null;
  code: string;
  slug: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  status?: CategoryStatus;
  createdBy: string;
}

export interface UpdateCategoryInput {
  parentId?: string | null;
  code?: string;
  slug?: string;
  name?: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  status?: CategoryStatus;
  updatedBy: string;
}

export type CategorySortField = 'name' | 'sortOrder' | 'createdAt';
export type CategorySortOrder = 'asc' | 'desc';

/** RFC-0002 §2 "Category Search", Decision S02/IP01 — tên tham số thống nhất toàn dự án Master Data. */
export interface CategorySearchParams {
  organizationId: string;
  search?: string;
  status?: CategoryStatus;
  parentId?: string;
  isActive?: boolean;
  page: number;
  limit: number;
  sortBy: CategorySortField;
  sortOrder: CategorySortOrder;
}

export interface CategorySearchResult {
  items: CategoryEntity[];
  total: number;
  page: number;
  limit: number;
}

export interface ICategoryRepository {
  create(input: CreateCategoryInput): Promise<CategoryEntity>;
  findById(id: string, organizationId: string): Promise<CategoryEntity | null>;
  findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<CategoryEntity | null>;
  /**
   * Optimistic Lock (SPEC-CATEGORY-001 §7.1, Decision Q9) — compare-and-swap trên `version`.
   * Ném `CategoryConcurrencyConflictError` nếu `expectedVersion` không khớp version hiện tại
   * trong DB (đúng mẫu Product module's repository update() ở T005, ADR-0007). Luôn tăng
   * `version` khi thành công.
   */
  update(
    id: string,
    expectedVersion: number,
    input: UpdateCategoryInput,
  ): Promise<CategoryEntity>;
  softDelete(id: string, deletedBy: string): Promise<void>;
  restore(id: string, restoredBy: string): Promise<void>;
  /** Toàn bộ category (chưa xóa mềm) trong Organization — dùng cho dựng cây (`getTree()`, không phân trang). */
  listAll(organizationId: string): Promise<CategoryEntity[]>;
  /** Danh sách phẳng có filter/phân trang (RFC-0002 §2 "Category Search"). */
  search(params: CategorySearchParams): Promise<CategorySearchResult>;
  existsByCode(
    organizationId: string,
    code: string,
    excludeId?: string,
  ): Promise<boolean>;
  existsBySlug(
    organizationId: string,
    slug: string,
    excludeId?: string,
  ): Promise<boolean>;
  /**
   * Chuỗi tổ tiên (từ cha trực tiếp tới gốc) của 1 Category, BAO GỒM cả tổ tiên đã xóa mềm
   * (Decision IP02) — dùng riêng cho guard Restore (SPEC-CATEGORY-001 §5, Decision Q7), KHÔNG
   * expose ra API, KHÔNG dùng lại cho chức năng thông thường (khác `listAll()`, vốn luôn lọc
   * `deletedAt: null` và giữ nguyên hành vi đó — không sửa `listAll()` để phục vụ nhu cầu này).
   * Ném lỗi nghiệp vụ (không lặp vô hạn) nếu phát hiện vòng lặp bất thường trong dữ liệu
   * (Decision IP03 — defensive, dù `assertNoCircularReference` đã chặn ở thời điểm ghi).
   */
  findAncestorChainIncludingArchived(
    categoryId: string,
    organizationId: string,
  ): Promise<CategoryEntity[]>;
}

export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');
