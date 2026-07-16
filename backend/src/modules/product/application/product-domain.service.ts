import { Inject, Injectable } from '@nestjs/common';
import { ProductEntity } from '../domain/entities/product.entity';
import { PRODUCT_REPOSITORY } from '../domain/repositories/product.repository.interface';
import type { IProductRepository } from '../domain/repositories/product.repository.interface';

/**
 * Cửa ngõ ĐỌC duy nhất của `Product` cho module khác (SPEC-PRODUCT-001 §8, ADR-0010 — Repository
 * Boundary). Khác bản chất với `InventoryDomainService`: Inventory giải quyết Single Writer (nhiều
 * module CÙNG GHI, có race condition — ADR-0005), còn Product chưa từng có module nào khác GHI
 * trực tiếp — vấn đề chỉ là export hygiene (chỉ `product` module được ghi `Product`, module khác
 * chỉ ĐỌC). Vì vậy `ProductDomainService` KHÔNG có `tx`/transaction, KHÔNG có method ghi.
 *
 * Đúng 4 phương thức mà 5 module phụ thuộc thực sự gọi hôm nay (Decision A01/A03 — YAGNI, không
 * thêm `create`/`update`/`archive`/`activate` "phòng khi cần sau"). Toàn bộ business logic ghi
 * tiếp tục nằm ở `ProductService` (nội bộ module `product`, dùng bởi `ProductController`).
 */
@Injectable()
export class ProductDomainService {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: IProductRepository,
  ) {}

  findById(id: string, organizationId: string): Promise<ProductEntity | null> {
    return this.productRepository.findById(id, organizationId);
  }

  hasActiveProductsInCategory(categoryId: string): Promise<boolean> {
    return this.productRepository.hasActiveProductsInCategory(categoryId);
  }

  hasActiveProductsInBrand(brandId: string): Promise<boolean> {
    return this.productRepository.hasActiveProductsInBrand(brandId);
  }

  hasActiveProductsInUnit(unitId: string): Promise<boolean> {
    return this.productRepository.hasActiveProductsInUnit(unitId);
  }
}
