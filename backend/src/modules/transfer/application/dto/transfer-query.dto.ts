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

const TRANSFER_STATUSES = [
  'DRAFT',
  'PENDING',
  'APPROVED',
  'SHIPPING',
  'RECEIVED',
  'CANCELLED',
] as const;

export class TransferQueryDto {
  @ApiProperty({ required: false, description: 'Tìm theo mã phiếu' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: TRANSFER_STATUSES })
  @IsOptional()
  @IsEnum(TRANSFER_STATUSES)
  status?: (typeof TRANSFER_STATUSES)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  fromWarehouseId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  toWarehouseId?: string;

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
