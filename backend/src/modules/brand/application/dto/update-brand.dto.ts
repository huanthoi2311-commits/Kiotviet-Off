import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUrl, Length } from 'class-validator';

const BRAND_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export class UpdateBrandDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  code?: string;

  @ApiProperty({ required: false, minLength: 2, maxLength: 255 })
  @IsOptional()
  @IsString()
  @Length(2, 255)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl({}, { message: 'website phải là URL hợp lệ' })
  website?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ required: false, enum: BRAND_STATUSES })
  @IsOptional()
  @IsEnum(BRAND_STATUSES)
  status?: (typeof BRAND_STATUSES)[number];
}
