import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const BRANCH_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;

export class BranchQueryDto {
  @ApiProperty({ required: false, description: 'Tìm theo name/code' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: BRANCH_STATUSES })
  @IsOptional()
  @IsIn(BRANCH_STATUSES)
  status?: (typeof BRANCH_STATUSES)[number];

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
