import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({
    required: false,
    example: 'b3a1c9e4-6f2a-4e11-9b3a-1e6c2f4a9d21',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ example: 'THOI-TRANG' })
  @IsString()
  @Length(1, 50)
  code: string;

  @ApiProperty({ example: 'Thời trang', minLength: 2, maxLength: 255 })
  @IsString()
  @Length(2, 255)
  name: string;

  @ApiProperty({ required: false, example: 'Ngành hàng thời trang nam nữ' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    required: false,
    example: 'https://cdn.example.com/categories/thoi-trang.jpg',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ required: false, example: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
