import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import type {
  SortOrder,
  SupplierSortField,
} from '../../domain/repositories/supplier.repository.interface';

const SUPPLIER_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
const SORT_FIELDS: SupplierSortField[] = [
  'code',
  'companyName',
  'createdAt',
  'updatedAt',
];
const SORT_ORDERS: SortOrder[] = ['asc', 'desc'];

export class SupplierQueryDto {
  @ApiProperty({
    required: false,
    description:
      'Tìm theo mã, tên công ty, mã số thuế, người liên hệ hoặc số điện thoại',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: SUPPLIER_STATUSES })
  @IsOptional()
  @IsEnum(SUPPLIER_STATUSES)
  status?: (typeof SUPPLIER_STATUSES)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  province?: string;

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
  sortBy?: SupplierSortField = 'createdAt';

  @ApiProperty({ required: false, enum: SORT_ORDERS, default: 'desc' })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: SortOrder = 'desc';
}
