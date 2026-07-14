import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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
  SortOrder,
  WarehouseSortField,
} from '../../domain/repositories/warehouse.repository.interface';

const WAREHOUSE_TYPES = [
  'MAIN',
  'RETAIL',
  'ONLINE',
  'RETURN',
  'DAMAGED',
  'TRANSIT',
  'CUSTOM',
] as const;
const WAREHOUSE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
const SORT_FIELDS: WarehouseSortField[] = [
  'name',
  'code',
  'createdAt',
  'updatedAt',
];
const SORT_ORDERS: SortOrder[] = ['asc', 'desc'];

export class WarehouseQueryDto {
  @ApiProperty({
    required: false,
    description: 'Tìm theo tên hoặc code (không phân biệt hoa thường)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ required: false, enum: WAREHOUSE_TYPES })
  @IsOptional()
  @IsEnum(WAREHOUSE_TYPES)
  type?: (typeof WAREHOUSE_TYPES)[number];

  @ApiProperty({ required: false, enum: WAREHOUSE_STATUSES })
  @IsOptional()
  @IsEnum(WAREHOUSE_STATUSES)
  status?: (typeof WAREHOUSE_STATUSES)[number];

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
  sortBy?: WarehouseSortField = 'createdAt';

  @ApiProperty({ required: false, enum: SORT_ORDERS, default: 'desc' })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: SortOrder = 'desc';
}
