import { CategoryEntity } from '../entities/category.entity';

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
  updatedBy: string;
}

export interface ICategoryRepository {
  create(input: CreateCategoryInput): Promise<CategoryEntity>;
  findById(id: string, organizationId: string): Promise<CategoryEntity | null>;
  findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<CategoryEntity | null>;
  update(id: string, input: UpdateCategoryInput): Promise<CategoryEntity>;
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
}

export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');
