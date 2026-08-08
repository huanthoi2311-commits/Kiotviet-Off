import type {
  ProductPriceEntity,
  ProductPriceType,
} from '../../../product/domain/entities/product.entity';

export interface ProductPriceSet {
  priceVersion: number;
  prices: ProductPriceEntity[];
}

export type { ProductPriceEntity, ProductPriceType };
