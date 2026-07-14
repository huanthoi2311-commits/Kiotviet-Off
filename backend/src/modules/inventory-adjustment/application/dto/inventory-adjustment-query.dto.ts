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

const ADJUSTMENT_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'COMPLETED',
] as const;
const ADJUSTMENT_REASONS = [
  'LOST',
  'DAMAGED',
  'FOUND',
  'SYSTEM',
  'OTHER',
] as const;

export class InventoryAdjustmentQueryDto {
  @ApiProperty({ required: false, description: 'Tìm theo mã phiếu' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: ADJUSTMENT_STATUSES })
  @IsOptional()
  @IsEnum(ADJUSTMENT_STATUSES)
  status?: (typeof ADJUSTMENT_STATUSES)[number];

  @ApiProperty({ required: false, enum: ADJUSTMENT_REASONS })
  @IsOptional()
  @IsEnum(ADJUSTMENT_REASONS)
  reason?: (typeof ADJUSTMENT_REASONS)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

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
