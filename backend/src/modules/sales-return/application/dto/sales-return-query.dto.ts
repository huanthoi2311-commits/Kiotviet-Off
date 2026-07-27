import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const SALES_RETURN_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'RECEIVED',
  'COMPLETED',
  'CANCELLED',
] as const;

export class SalesReturnQueryDto {
  @ApiProperty({ required: false, description: 'Tìm theo mã phiếu trả' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: SALES_RETURN_STATUSES })
  @IsOptional()
  @IsEnum(SALES_RETURN_STATUSES)
  status?: (typeof SALES_RETURN_STATUSES)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

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
