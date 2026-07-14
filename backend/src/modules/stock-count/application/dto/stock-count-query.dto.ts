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

const STOCK_COUNT_STATUSES = [
  'DRAFT',
  'COUNTING',
  'COMPLETED',
  'CANCELLED',
] as const;

export class StockCountQueryDto {
  @ApiProperty({ required: false, description: 'Tìm theo mã phiếu' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: STOCK_COUNT_STATUSES })
  @IsOptional()
  @IsEnum(STOCK_COUNT_STATUSES)
  status?: (typeof STOCK_COUNT_STATUSES)[number];

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
