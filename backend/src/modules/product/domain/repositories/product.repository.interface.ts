import {
  BarcodeType,
  ProductEntity,
  ProductPriceType,
  ProductStatus,
  ProductType,
} from '../entities/product.entity';

export interface CreateProductPriceInput {
  type: ProductPriceType;
  price: number;
}

export interface CreateProductImageInput {
  url: string;
  sortOrder?: number;
  isThumbnail?: boolean;
}

export interface CreateProductBarcodeInput {
  code: string;
  type: BarcodeType;
  isDefault?: boolean;
}

export interface CreateProductInput {
  organizationId: string;
  categoryId: string;
  brandId?: string | null;
  unitId: string;
  /** Bắt buộc nếu `type=VARIANT_CHILD`, phải null với mọi type khác (SPEC-PRODUCT-001 §5). */
  parentProductId?: string | null;
  sku: string;
  slug: string;
  name: string;
  description?: string | null;
  costPrice: number;
  vat?: number;
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  minStock?: number | null;
  maxStock?: number | null;
  type: ProductType;
  allowSale?: boolean;
  status?: ProductStatus;
  isActive?: boolean;
  prices: CreateProductPriceInput[];
  images?: CreateProductImageInput[];
  barcodes?: CreateProductBarcodeInput[];
  createdBy: string;
}

export interface UpdateProductInput {
  categoryId?: string;
  brandId?: string | null;
  unitId?: string;
  parentProductId?: string | null;
  name?: string;
  slug?: string;
  description?: string | null;
  costPrice?: number;
  vat?: number;
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  minStock?: number | null;
  maxStock?: number | null;
  type?: ProductType;
  allowSale?: boolean;
  status?: ProductStatus;
  isActive?: boolean;
  updatedBy: string;
}

export type ProductSortField =
  'name' | 'sku' | 'price' | 'createdAt' | 'updatedAt';
export type SortOrder = 'asc' | 'desc';

export interface ProductSearchParams {
  organizationId: string;
  search?: string;
  categoryId?: string;
  brandId?: string;
  unitId?: string;
  status?: ProductStatus;
  type?: ProductType;
  parentProductId?: string;
  createdFrom?: Date;
  createdTo?: Date;
  updatedFrom?: Date;
  updatedTo?: Date;
  includeDeleted?: boolean;
  page: number;
  limit: number;
  sortBy: ProductSortField;
  sortOrder: SortOrder;
}

export interface ProductSearchResult {
  items: ProductEntity[];
  total: number;
  page: number;
  limit: number;
}

export interface IProductRepository {
  create(input: CreateProductInput): Promise<ProductEntity>;
  findById(id: string, organizationId: string): Promise<ProductEntity | null>;
  findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<ProductEntity | null>;
  /**
   * Optimistic Lock (SPEC-PRODUCT-001 §7.1, Decision A02/A09) — compare-and-swap trên `version`.
   * Ném `ProductConcurrencyConflictError` nếu `expectedVersion` không khớp version hiện tại
   * trong DB (đúng mẫu `InventoryConcurrencyConflictError`, ADR-0007). Luôn tăng `version`,
   * cập nhật `updatedAt`/`updatedBy` khi thành công.
   */
  update(
    id: string,
    expectedVersion: number,
    input: UpdateProductInput,
  ): Promise<ProductEntity>;
  softDelete(id: string, deletedBy: string): Promise<void>;
  restore(id: string, restoredBy: string): Promise<void>;
  search(params: ProductSearchParams): Promise<ProductSearchResult>;
  existsBySku(organizationId: string, sku: string): Promise<boolean>;
  existsBySlug(
    organizationId: string,
    slug: string,
    excludeId?: string,
  ): Promise<boolean>;
  existsByBarcode(organizationId: string, code: string): Promise<boolean>;
  hasActiveProductsInCategory(categoryId: string): Promise<boolean>;
  hasActiveProductsInBrand(brandId: string): Promise<boolean>;
  hasActiveProductsInUnit(unitId: string): Promise<boolean>;
  /** Toàn bộ Product có `parentProductId` trỏ tới Product này (SPEC-PRODUCT-001 §7.1). */
  findChildrenByParentId(
    parentProductId: string,
    organizationId: string,
  ): Promise<ProductEntity[]>;
  /** Dùng cho guard "không Archive Variant Parent nếu còn Variant Child status=ACTIVE" (RFC §8). */
  hasActiveVariantChildren(parentProductId: string): Promise<boolean>;
}

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');
