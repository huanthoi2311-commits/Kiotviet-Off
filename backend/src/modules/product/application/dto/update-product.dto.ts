import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import type {
  ProductStatus,
  ProductType,
} from '../../domain/entities/product.entity';

const PRODUCT_STATUSES: ProductStatus[] = ['ACTIVE', 'INACTIVE', 'ARCHIVED'];
const PRODUCT_TYPES: ProductType[] = [
  'STANDARD',
  'SERVICE',
  'VARIANT_PARENT',
  'VARIANT_CHILD',
];

export class UpdateProductDto {
  @ApiProperty({
    description:
      'Optimistic Lock (SPEC-PRODUCT-001 §7.1) — gửi lại đúng version đã đọc trước đó; sai version bị từ chối (409)',
  })
  @IsInt()
  version: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  brandId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiProperty({
    required: false,
    enum: PRODUCT_TYPES,
    description:
      'Không cho đổi nếu Product đã phát sinh giao dịch (SPEC-PRODUCT-001 §5, Decision A06)',
  })
  @IsOptional()
  @IsEnum(PRODUCT_TYPES)
  type?: ProductType;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  parentProductId?: string | null;

  @ApiProperty({ required: false, minLength: 3, maxLength: 255 })
  @IsOptional()
  @IsString()
  @Length(3, 255, { message: 'Tên sản phẩm phải từ 3 đến 255 ký tự' })
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vat?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  length?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  width?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  height?: number;

  @ApiProperty({ required: false, enum: PRODUCT_STATUSES })
  @IsOptional()
  @IsEnum(PRODUCT_STATUSES)
  status?: ProductStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
