import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type {
  BarcodeType,
  ProductPriceType,
  ProductStatus,
  ProductType,
} from '../../domain/entities/product.entity';

const PRODUCT_PRICE_TYPES: ProductPriceType[] = [
  'RETAIL',
  'WHOLESALE',
  'VIP',
  'DEALER',
];
const BARCODE_TYPES: BarcodeType[] = [
  'EAN13',
  'EAN8',
  'CODE128',
  'QR',
  'CUSTOM',
];
const PRODUCT_STATUSES: ProductStatus[] = ['ACTIVE', 'INACTIVE', 'ARCHIVED'];
const PRODUCT_TYPES: ProductType[] = [
  'STANDARD',
  'SERVICE',
  'VARIANT_PARENT',
  'VARIANT_CHILD',
];

export class CreateProductPriceDto {
  @ApiProperty({ enum: PRODUCT_PRICE_TYPES, example: 'RETAIL' })
  @IsEnum(PRODUCT_PRICE_TYPES)
  type: ProductPriceType;

  @ApiProperty({ example: 150000 })
  @IsNumber()
  @Min(0)
  price: number;
}

export class CreateProductImageDto {
  @ApiProperty({ example: 'https://cdn.example.com/products/ao-thun.jpg' })
  @IsString()
  url: string;

  @ApiProperty({ required: false, example: 0 })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  isThumbnail?: boolean;
}

export class CreateProductBarcodeDto {
  @ApiProperty({ example: '8938505970017' })
  @IsString()
  code: string;

  @ApiProperty({ enum: BARCODE_TYPES, example: 'EAN13' })
  @IsEnum(BARCODE_TYPES)
  type: BarcodeType;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class CreateProductDto {
  @ApiProperty({ example: 'b3a1c9e4-6f2a-4e11-9b3a-1e6c2f4a9d21' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({
    required: false,
    example: 'a1b2c3d4-5678-4e11-9b3a-1e6c2f4a9d21',
  })
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @ApiProperty({ example: 'c9d8e7f6-1234-4e11-9b3a-1e6c2f4a9d21' })
  @IsUUID()
  unitId: string;

  @ApiProperty({ enum: PRODUCT_TYPES, example: 'STANDARD' })
  @IsEnum(PRODUCT_TYPES)
  type: ProductType;

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Bắt buộc nếu type=VARIANT_CHILD (Product tại đây phải có type=VARIANT_PARENT), phải để trống với type khác',
  })
  @IsOptional()
  @IsUUID()
  parentProductId?: string;

  @ApiProperty({ example: 'Áo thun nam cổ tròn', minLength: 3, maxLength: 255 })
  @IsString()
  @Length(3, 255, { message: 'Tên sản phẩm phải từ 3 đến 255 ký tự' })
  name: string;

  @ApiProperty({ required: false, example: 'Chất liệu cotton 100%' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 90000 })
  @IsNumber()
  @Min(0)
  costPrice: number;

  @ApiProperty({ required: false, example: 8, description: '% thuế GTGT' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vat?: number;

  @ApiProperty({ required: false, example: 0.2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @ApiProperty({ required: false, example: 30 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  length?: number;

  @ApiProperty({ required: false, example: 20 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  width?: number;

  @ApiProperty({ required: false, example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  height?: number;

  @ApiProperty({ required: false, enum: PRODUCT_STATUSES, example: 'ACTIVE' })
  @IsOptional()
  @IsEnum(PRODUCT_STATUSES)
  status?: ProductStatus;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    type: [CreateProductPriceDto],
    description: 'Bắt buộc có ít nhất 1 mức giá RETAIL',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Sản phẩm phải có ít nhất 1 mức giá' })
  @ValidateNested({ each: true })
  @Type(() => CreateProductPriceDto)
  prices: CreateProductPriceDto[];

  @ApiProperty({ required: false, type: [CreateProductImageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductImageDto)
  images?: CreateProductImageDto[];

  @ApiProperty({ required: false, type: [CreateProductBarcodeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductBarcodeDto)
  barcodes?: CreateProductBarcodeDto[];
}
