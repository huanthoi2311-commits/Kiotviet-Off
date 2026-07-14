import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const BRAND_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export class BrandQueryDto {
  @ApiProperty({
    required: false,
    description: 'Tìm theo tên hoặc code (không phân biệt hoa thường)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: BRAND_STATUSES })
  @IsOptional()
  @IsEnum(BRAND_STATUSES)
  status?: (typeof BRAND_STATUSES)[number];

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
