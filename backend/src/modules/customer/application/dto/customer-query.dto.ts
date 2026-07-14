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
  CustomerSortField,
  SortOrder,
} from '../../domain/repositories/customer.repository.interface';

const CUSTOMER_TYPES = [
  'RETAIL',
  'WHOLESALE',
  'VIP',
  'DEALER',
  'COMPANY',
] as const;
const CUSTOMER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
const SORT_FIELDS: CustomerSortField[] = [
  'code',
  'fullName',
  'createdAt',
  'updatedAt',
];
const SORT_ORDERS: SortOrder[] = ['asc', 'desc'];

export class CustomerQueryDto {
  @ApiProperty({
    required: false,
    description:
      'Tìm theo tên, số điện thoại, email, tên công ty hoặc mã số thuế',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: CUSTOMER_TYPES })
  @IsOptional()
  @IsEnum(CUSTOMER_TYPES)
  customerType?: (typeof CUSTOMER_TYPES)[number];

  @ApiProperty({ required: false, enum: CUSTOMER_STATUSES })
  @IsOptional()
  @IsEnum(CUSTOMER_STATUSES)
  status?: (typeof CUSTOMER_STATUSES)[number];

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
  sortBy?: CustomerSortField = 'createdAt';

  @ApiProperty({ required: false, enum: SORT_ORDERS, default: 'desc' })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: SortOrder = 'desc';
}
