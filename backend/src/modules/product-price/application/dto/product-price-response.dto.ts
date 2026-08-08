import { ApiProperty } from '@nestjs/swagger';
import { ProductPriceResponseDto } from '../../../product/application/dto/product-response.dto';

export { ProductPriceResponseDto };

export class ProductPriceSetResponseDto {
  @ApiProperty() productId: string;

  @ApiProperty({
    description:
      'Optimistic Lock cho toàn bộ price set (T043.07, tách khỏi Product.version)',
  })
  priceVersion: number;

  @ApiProperty({ type: [ProductPriceResponseDto] })
  prices: ProductPriceResponseDto[];
}
