import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export const PURCHASE_REPORT_GROUP_BY = [
  'SUPPLIER',
  'PRODUCT',
  'WAREHOUSE',
  'MONTH',
  'USER',
  'CATEGORY',
] as const;

export class PurchaseReportFilterDto {
  @ApiProperty({ required: false, description: 'Từ ngày (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiProperty({ required: false, description: 'Đến ngày (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class PurchaseReportBreakdownQueryDto extends PurchaseReportFilterDto {
  @ApiProperty({ enum: PURCHASE_REPORT_GROUP_BY })
  @IsEnum(PURCHASE_REPORT_GROUP_BY)
  groupBy: (typeof PURCHASE_REPORT_GROUP_BY)[number];

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
}

const PURCHASE_REPORT_EXPORT_FORMATS = ['EXCEL', 'CSV', 'PDF'] as const;

/** Export luôn xuất TOÀN BỘ dòng khớp filter (không phân trang) — số dòng bị giới hạn bởi
 * số lượng nhóm phân biệt (supplier/product/...), không phải số PurchaseOrder. */
export class PurchaseReportExportQueryDto extends PurchaseReportFilterDto {
  @ApiProperty({ enum: PURCHASE_REPORT_GROUP_BY })
  @IsEnum(PURCHASE_REPORT_GROUP_BY)
  groupBy: (typeof PURCHASE_REPORT_GROUP_BY)[number];

  @ApiProperty({ enum: PURCHASE_REPORT_EXPORT_FORMATS })
  @IsEnum(PURCHASE_REPORT_EXPORT_FORMATS)
  format: (typeof PURCHASE_REPORT_EXPORT_FORMATS)[number];
}
