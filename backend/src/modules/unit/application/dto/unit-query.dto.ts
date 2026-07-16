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
  UnitSortField,
  UnitSortOrder,
} from '../../domain/repositories/unit.repository.interface';

const UNIT_QUERY_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
const SORT_FIELDS: UnitSortField[] = ['name', 'code', 'createdAt'];
const SORT_ORDERS: UnitSortOrder[] = ['asc', 'desc'];

/** Query params cho GET /units (SPEC-UNIT-001 §4.1, Decision RQ7/UP01). */
export class UnitQueryDto {
  @ApiProperty({
    required: false,
    description: 'Tìm theo tên hoặc code (không phân biệt hoa thường)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: UNIT_QUERY_STATUSES })
  @IsOptional()
  @IsEnum(UNIT_QUERY_STATUSES)
  status?: (typeof UNIT_QUERY_STATUSES)[number];

  @ApiProperty({
    required: false,
    description:
      'Filter alias tầng business cho status — KHÔNG phải cột schema (Decision SU04). true => status=ACTIVE, false => status khác ACTIVE.',
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
  sortBy?: UnitSortField = 'name';

  @ApiProperty({ required: false, enum: SORT_ORDERS, default: 'asc' })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: UnitSortOrder = 'asc';
}
