import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import type {
  BrandSortField,
  BrandSortOrder,
} from '../../domain/repositories/brand.repository.interface';

const BRAND_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
const SORT_FIELDS: BrandSortField[] = ['name', 'code', 'createdAt'];
const SORT_ORDERS: BrandSortOrder[] = ['asc', 'desc'];

/** Query params cho GET /brands (SPEC-BRAND-001 §4.1, Decision B02.5/RQ1/RQ3/RQ4). */
export class BrandQueryDto {
  @ApiProperty({
    required: false,
    description: 'Tìm theo tên hoặc code (không phân biệt hoa thường)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: BRAND_STATUSES })
  @IsOptional()
  @IsEnum(BRAND_STATUSES)
  status?: (typeof BRAND_STATUSES)[number];

  @ApiProperty({
    required: false,
    description:
      'Filter alias tầng business cho status — KHÔNG phải cột schema (Decision RQ1). true => status=ACTIVE, false => status khác ACTIVE. Có thể dùng đồng thời với status (Decision RQ4).',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

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

  @ApiProperty({ required: false, enum: SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: BrandSortField = 'name';

  @ApiProperty({ required: false, enum: SORT_ORDERS, default: 'asc' })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: BrandSortOrder = 'asc';
}
