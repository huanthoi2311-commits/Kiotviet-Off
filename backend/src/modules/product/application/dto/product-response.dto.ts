import { ApiProperty } from '@nestjs/swagger';

export class ProductPriceResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() type: string;
  @ApiProperty() price: string;
}

export class ProductImageResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() url: string;
  @ApiProperty() sortOrder: number;
  @ApiProperty() isThumbnail: boolean;
}

export class ProductBarcodeResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() type: string;
  @ApiProperty() isDefault: boolean;
}

export class ProductResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() sku: string;
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty() categoryId: string;
  @ApiProperty({ nullable: true }) brandId: string | null;
  @ApiProperty() unitId: string;
  @ApiProperty() costPrice: string;
  @ApiProperty() vat: string;
  @ApiProperty({ nullable: true }) weight: string | null;
  @ApiProperty({ nullable: true }) length: string | null;
  @ApiProperty({ nullable: true }) width: string | null;
  @ApiProperty({ nullable: true }) height: string | null;
  @ApiProperty() isService: boolean;
  @ApiProperty() allowSale: boolean;
  @ApiProperty() status: string;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ type: [ProductPriceResponseDto] })
  prices: ProductPriceResponseDto[];
  @ApiProperty({ type: [ProductImageResponseDto] })
  images: ProductImageResponseDto[];
  @ApiProperty({ type: [ProductBarcodeResponseDto] })
  barcodes: ProductBarcodeResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ nullable: true }) deletedAt: Date | null;
}

export class PaginatedProductResponseDto {
  @ApiProperty({ type: [ProductResponseDto] }) items: ProductResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
