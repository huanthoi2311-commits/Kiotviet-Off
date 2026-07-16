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
  /** Toàn bộ category (chưa xóa mềm) trong Organization — dùng cho danh sách phẳng và dựng cây. */
  listAll(organizationId: string): Promise<CategoryEntity[]>;
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
