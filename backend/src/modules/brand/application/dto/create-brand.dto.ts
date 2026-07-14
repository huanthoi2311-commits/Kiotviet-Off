import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUrl, Length } from 'class-validator';

const BRAND_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export class CreateBrandDto {
  @ApiProperty({ example: 'NIKE' })
  @IsString()
  @Length(1, 50)
  code: string;

  @ApiProperty({ example: 'Nike', minLength: 2, maxLength: 255 })
  @IsString()
  @Length(2, 255)
  name: string;

  @ApiProperty({
    required: false,
    example: 'https://cdn.example.com/brands/nike.png',
  })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({ required: false, example: 'Thương hiệu thể thao toàn cầu' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, example: 'https://nike.com' })
  @IsOptional()
  @IsUrl({}, { message: 'website phải là URL hợp lệ' })
  website?: string;

  @ApiProperty({ required: false, example: 'USA' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ required: false, enum: BRAND_STATUSES, example: 'ACTIVE' })
  @IsOptional()
  @IsEnum(BRAND_STATUSES)
  status?: (typeof BRAND_STATUSES)[number];
}
