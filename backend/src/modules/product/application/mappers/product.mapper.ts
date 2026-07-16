import { ProductEntity } from '../../domain/entities/product.entity';
import { ProductResponseDto } from '../dto/product-response.dto';

export class ProductMapper {
  static toResponseDto(entity: ProductEntity): ProductResponseDto {
    return {
      id: entity.id,
      sku: entity.sku,
      slug: entity.slug,
      name: entity.name,
      description: entity.description,
      categoryId: entity.categoryId,
      brandId: entity.brandId,
      unitId: entity.unitId,
      parentProductId: entity.parentProductId,
      costPrice: entity.costPrice,
      vat: entity.vat,
      weight: entity.weight,
      length: entity.length,
      width: entity.width,
      height: entity.height,
      type: entity.type,
      allowSale: entity.allowSale,
      status: entity.status,
      isActive: entity.isActive,
      version: entity.version,
      prices: entity.prices,
      images: entity.images,
      barcodes: entity.barcodes,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
