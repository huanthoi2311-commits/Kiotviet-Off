import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import type {
  ProductStatus,
  ProductType,
} from '../../domain/entities/product.entity';
import type {
  ProductSortField,
  SortOrder,
} from '../../domain/repositories/product.repository.interface';

const PRODUCT_STATUSES: ProductStatus[] = ['ACTIVE', 'INACTIVE', 'ARCHIVED'];
const PRODUCT_TYPES: ProductType[] = [
  'STANDARD',
  'SERVICE',
  'VARIANT_PARENT',
  'VARIANT_CHILD',
];
const SORT_FIELDS: ProductSortField[] = [
  'name',
  'sku',
  'price',
  'createdAt',
  'updatedAt',
];
const SORT_ORDERS: SortOrder[] = ['asc', 'desc'];

export class ProductQueryDto {
  @ApiProperty({
    required: false,
    description: 'Tìm theo tên, SKU hoặc barcode (không phân biệt hoa thường)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  parentProductId?: string;

  @ApiProperty({ required: false, enum: PRODUCT_STATUSES })
  @IsOptional()
  @IsEnum(PRODUCT_STATUSES)
  status?: ProductStatus;

  @ApiProperty({ required: false, enum: PRODUCT_TYPES })
  @IsOptional()
  @IsEnum(PRODUCT_TYPES)
  type?: ProductType;

  @ApiProperty({ required: false, example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiProperty({ required: false, example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  updatedFrom?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  updatedTo?: string;

  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({ required: false, enum: SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: ProductSortField = 'createdAt';

  @ApiProperty({ required: false, enum: SORT_ORDERS, default: 'desc' })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: SortOrder = 'desc';
}
