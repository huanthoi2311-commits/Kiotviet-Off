import { Module } from '@nestjs/common';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { PRODUCT_PRICE_REPOSITORY } from './domain/repositories/product-price.repository.interface';
import { PrismaProductPriceRepository } from './infrastructure/persistence/prisma-product-price.repository';
import { ProductPriceService } from './application/product-price.service';
import { ProductPriceController } from './presentation/product-price.controller';

/**
 * SPEC-T043.07 §16 — module mới, độc lập với `product`. Import `ProductModule` chỉ để lấy
 * `ProductDomainService` (đã export sẵn từ SPEC-PRODUCT-001 §7.2, không cần đổi gì ở đó) — dùng
 * cho xác nhận Product tồn tại/thuộc đúng organization trước khi đọc/ghi price set (§10).
 */
@Module({
  imports: [RbacModule, ProductModule],
  controllers: [ProductPriceController],
  providers: [
    ProductPriceService,
    {
      provide: PRODUCT_PRICE_REPOSITORY,
      useClass: PrismaProductPriceRepository,
    },
  ],
})
export class ProductPriceModule {}
