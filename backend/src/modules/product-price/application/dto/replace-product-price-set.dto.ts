import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { ProductPriceType } from '../../domain/entities/product-price.entity';

const PRODUCT_PRICE_TYPES: ProductPriceType[] = [
  'RETAIL',
  'WHOLESALE',
  'VIP',
  'DEALER',
];

/** Mirror `CreateProductPriceDto` (product module) field-for-field — SPEC-T043.07 §2. */
export class ReplaceProductPriceItemDto {
  @ApiProperty({ enum: PRODUCT_PRICE_TYPES, example: 'RETAIL' })
  @IsEnum(PRODUCT_PRICE_TYPES)
  type: ProductPriceType;

  @ApiProperty({ example: 150000 })
  @IsNumber()
  @Min(0)
  price: number;
}

export class ReplaceProductPriceSetDto {
  @ApiProperty({
    description:
      'Optimistic Lock cho toàn bộ price set — bắt buộc (SPEC-T043.07 §4)',
  })
  @IsInt()
  priceVersion: number;

  @ApiProperty({
    type: [ReplaceProductPriceItemDto],
    description:
      'Toàn bộ price set mong muốn — bulk-replace, không phải patch từng dòng',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReplaceProductPriceItemDto)
  prices: ReplaceProductPriceItemDto[];
}
