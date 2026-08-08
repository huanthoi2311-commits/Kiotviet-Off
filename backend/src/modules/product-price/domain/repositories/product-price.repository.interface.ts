import type {
  ProductPriceEntity,
  ProductPriceType,
} from '../entities/product-price.entity';

export interface ProductPriceItemInput {
  type: ProductPriceType;
  price: number;
}

export interface ProductPriceSetResult {
  priceVersion: number;
  prices: ProductPriceEntity[];
}

/**
 * SPEC-T043.07 §8 — dedicated boundary, tách khỏi `IProductRepository` (Architect Decision
 * T043.06 §5). `findSetByProductId`/`replaceSet` chỉ thao tác trên `ProductPrice` + cột
 * `Product.priceVersion` (compare-and-swap) — không bao giờ đọc/ghi các field khác của `Product`.
 */
export interface IProductPriceRepository {
  /** `null` nếu `productId` không tồn tại. Không lọc theo organizationId ở đây — việc xác nhận
   *  Product tồn tại và thuộc đúng organization đã do `ProductDomainService` đảm nhiệm ở tầng
   *  Service (SPEC-T043.07 §10), trước khi repository này được gọi. */
  findSetByProductId(productId: string): Promise<ProductPriceSetResult | null>;

  /**
   * Compare-and-swap trên `Product.priceVersion`, rồi thay toàn bộ `ProductPrice` của
   * `productId` trong CÙNG 1 transaction (SPEC-T043.07 §9). Ném
   * `ProductPriceConcurrencyConflictError` nếu `expectedPriceVersion` không khớp.
   */
  replaceSet(
    productId: string,
    expectedPriceVersion: number,
    prices: ProductPriceItemInput[],
    updatedBy: string,
  ): Promise<ProductPriceSetResult>;
}

export const PRODUCT_PRICE_REPOSITORY = Symbol('PRODUCT_PRICE_REPOSITORY');
