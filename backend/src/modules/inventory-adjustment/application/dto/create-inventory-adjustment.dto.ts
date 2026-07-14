import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

const ADJUSTMENT_REASONS = [
  'LOST',
  'DAMAGED',
  'FOUND',
  'SYSTEM',
  'OTHER',
] as const;

export class CreateInventoryAdjustmentItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({
    example: -5,
    description: 'Delta có dấu — dương = tăng, âm = giảm',
  })
  @IsNumber()
  quantity: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class CreateInventoryAdjustmentDto {
  @ApiProperty({ description: 'Kho cần điều chỉnh tồn kho' })
  @IsUUID()
  warehouseId: string;

  @ApiProperty({
    enum: ADJUSTMENT_REASONS,
    description: 'Bắt buộc — lý do điều chỉnh',
  })
  @IsEnum(ADJUSTMENT_REASONS)
  reason: (typeof ADJUSTMENT_REASONS)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ type: [CreateInventoryAdjustmentItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInventoryAdjustmentItemDto)
  items: CreateInventoryAdjustmentItemDto[];
}
