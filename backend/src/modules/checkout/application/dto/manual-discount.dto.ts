import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
} from 'class-validator';

const MANUAL_DISCOUNT_TYPES = [
  'PERCENT',
  'AMOUNT',
  'FIXED_PRICE',
  'BUY_X_GET_Y',
] as const;

/** Discount do thu ngân tự nhập tại quầy (source MANUAL, ưu tiên cao nhất — Discount Engine, Prompt 034). */
export class ManualDiscountDto {
  @ApiProperty({ enum: MANUAL_DISCOUNT_TYPES })
  @IsIn(MANUAL_DISCOUNT_TYPES)
  type: (typeof MANUAL_DISCOUNT_TYPES)[number];

  @ApiProperty({
    required: false,
    description: 'PERCENT (%) | AMOUNT | FIXED_PRICE (đơn giá mới)',
  })
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiProperty({
    required: false,
    description: 'Bắt buộc với FIXED_PRICE/BUY_X_GET_Y',
  })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @IsPositive()
  buyQuantity?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @IsPositive()
  getQuantity?: number;
}
