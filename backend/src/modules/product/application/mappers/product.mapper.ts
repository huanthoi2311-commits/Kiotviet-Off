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
      costPrice: entity.costPrice,
      vat: entity.vat,
      weight: entity.weight,
      length: entity.length,
      width: entity.width,
      height: entity.height,
      // Cau noi tam thoi - ProductResponseDto chua doi sang "type" (SPEC-PRODUCT-001 SS9, se lam
      // o Commit 4 cung DTO). Suy nguoc tu "type" de giu dung hanh vi API hien tai khong doi.
      isService: entity.type === 'SERVICE',
      allowSale: entity.allowSale,
      status: entity.status,
      isActive: entity.isActive,
      prices: entity.prices,
      images: entity.images,
      barcodes: entity.barcodes,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
