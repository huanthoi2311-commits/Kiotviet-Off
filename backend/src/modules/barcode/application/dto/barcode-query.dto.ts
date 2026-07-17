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
  BarcodeSortField,
  BarcodeSortOrder,
} from '../../domain/repositories/barcode.repository.interface';

const BARCODE_QUERY_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
const SORT_FIELDS: BarcodeSortField[] = ['code', 'createdAt'];
const SORT_ORDERS: BarcodeSortOrder[] = ['asc', 'desc'];

/** Query params cho GET /barcodes — tra cứu org-wide (SPEC-BARCODE-001 §4.2/§4.3, Decision BQ1/SB08/SB09). */
export class BarcodeQueryDto {
  @ApiProperty({
    required: false,
    description:
      'Tìm theo code (không phân biệt hoa thường) — Barcode không có field name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: BARCODE_QUERY_STATUSES })
  @IsOptional()
  @IsEnum(BARCODE_QUERY_STATUSES)
  status?: (typeof BARCODE_QUERY_STATUSES)[number];

  @ApiProperty({
    required: false,
    description:
      'Filter alias tầng business cho status — KHÔNG phải cột schema. true => status=ACTIVE, false => status khác ACTIVE.',
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

  @ApiProperty({
    required: false,
    enum: SORT_FIELDS,
    default: 'createdAt',
    description:
      'Mặc định createdAt (Decision SB08 — Barcode không có field name)',
  })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: BarcodeSortField = 'createdAt';

  @ApiProperty({ required: false, enum: SORT_ORDERS, default: 'desc' })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: BarcodeSortOrder = 'desc';
}
