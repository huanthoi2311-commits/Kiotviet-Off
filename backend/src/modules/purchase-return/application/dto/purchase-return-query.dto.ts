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

const PURCHASE_RETURN_STATUSES = [
  'DRAFT',
  'APPROVED',
  'COMPLETED',
  'CANCELLED',
] as const;

export class PurchaseReturnQueryDto {
  @ApiProperty({ required: false, description: 'Tìm theo mã phiếu trả' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: PURCHASE_RETURN_STATUSES })
  @IsOptional()
  @IsEnum(PURCHASE_RETURN_STATUSES)
  status?: (typeof PURCHASE_RETURN_STATUSES)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

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
