import { ProductPriceSetResult } from '../../domain/repositories/product-price.repository.interface';
import { ProductPriceSetResponseDto } from '../dto/product-price-response.dto';

export class ProductPriceMapper {
  static toResponseDto(
    productId: string,
    set: ProductPriceSetResult,
  ): ProductPriceSetResponseDto {
    return {
      productId,
      priceVersion: set.priceVersion,
      prices: set.prices,
    };
  }
}
