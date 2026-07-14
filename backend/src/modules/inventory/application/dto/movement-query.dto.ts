import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const MOVEMENT_TYPES = [
  'PURCHASE',
  'SALE',
  'RETURN',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUSTMENT',
  'COUNT',
  'DAMAGE',
  'INITIAL',
] as const;

const REFERENCE_TYPES = [
  'PURCHASE',
  'POS',
  'TRANSFER',
  'COUNT',
  'RETURN',
  'SYSTEM',
] as const;

export class MovementQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({ required: false, enum: MOVEMENT_TYPES })
  @IsOptional()
  @IsEnum(MOVEMENT_TYPES)
  movementType?: (typeof MOVEMENT_TYPES)[number];

  @ApiProperty({ required: false, enum: REFERENCE_TYPES })
  @IsOptional()
  @IsEnum(REFERENCE_TYPES)
  referenceType?: (typeof REFERENCE_TYPES)[number];

  @ApiProperty({ required: false, example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiProperty({ required: false, example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

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
