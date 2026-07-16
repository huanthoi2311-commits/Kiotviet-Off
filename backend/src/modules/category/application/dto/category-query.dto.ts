import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import type { CategoryStatus } from '../../domain/entities/category.entity';
import type {
  CategorySortField,
  CategorySortOrder,
} from '../../domain/repositories/category.repository.interface';

const CATEGORY_STATUSES: CategoryStatus[] = [
  'DRAFT',
  'ACTIVE',
  'INACTIVE',
  'ARCHIVED',
];
const SORT_FIELDS: CategorySortField[] = ['name', 'sortOrder', 'createdAt'];
const SORT_ORDERS: CategorySortOrder[] = ['asc', 'desc'];

/** Query params cho GET /categories (RFC-0002 §2 "Category Search", Decision S02/IP01). */
export class CategoryQueryDto {
  @ApiProperty({
    required: false,
    description: 'Tìm theo tên hoặc mã danh mục (không phân biệt hoa thường)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: CATEGORY_STATUSES })
  @IsOptional()
  @IsIn(CATEGORY_STATUSES)
  status?: CategoryStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ required: false })
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

  @ApiProperty({ required: false, enum: SORT_FIELDS, default: 'sortOrder' })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: CategorySortField = 'sortOrder';

  @ApiProperty({ required: false, enum: SORT_ORDERS, default: 'asc' })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: CategorySortOrder = 'asc';
}
