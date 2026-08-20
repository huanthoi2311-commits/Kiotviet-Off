import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { UsageLimitModule } from '../usage-limit/usage-limit.module';
import { CategoryReferenceModule } from '../category/category-reference.module';
import { BrandReferenceModule } from '../brand/brand-reference.module';
import { UnitReferenceModule } from '../unit/unit-reference.module';
import { ProductService } from './application/product.service';
import { ProductDomainService } from './application/product-domain.service';
import { PRODUCT_REPOSITORY } from './domain/repositories/product.repository.interface';
import { SKU_GENERATOR } from './domain/services/sku-generator.interface';
import { SLUG_GENERATOR } from './domain/services/slug-generator.interface';
import { SequenceSkuGenerator } from './infrastructure/generators/sequence-sku.generator';
import { SlugifySlugGenerator } from './infrastructure/generators/slugify-slug.generator';
import { PrismaProductRepository } from './infrastructure/persistence/prisma-product.repository';
import { ProductController } from './presentation/product.controller';

// T053.05C-2 — CategoryReferenceModule/BrandReferenceModule/UnitReferenceModule (module lá, chỉ
// export *ReferenceService/UnitDomainService, KHÔNG import ProductModule) để ProductService xác
// minh categoryId/brandId/unitId (foreign id tenant-owned) thuộc actor.organizationId TRƯỚC khi
// ghi. KHÔNG import CategoryModule/BrandModule/UnitModule đầy đủ (cả 3 đều đã import ProductModule
// — import ngược lại sẽ tạo circular dependency Product→Category→Product/tương tự).
@Module({
  imports: [
    RbacModule,
    UsageLimitModule,
    CategoryReferenceModule,
    BrandReferenceModule,
    UnitReferenceModule,
  ],
  controllers: [ProductController],
  providers: [
    ProductService,
    ProductDomainService,
    { provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository },
    { provide: SKU_GENERATOR, useClass: SequenceSkuGenerator },
    { provide: SLUG_GENERATOR, useClass: SlugifySlugGenerator },
  ],
  // PRODUCT_REPOSITORY khong con export (SPEC-PRODUCT-001 SS7.2, ADR-0010) - ca 5 module phu
  // thuoc (category/brand/unit/barcode/cart) da chuyen sang inject ProductDomainService o cung
  // Commit nay. Repository tro thanh provider noi bo, chi dung trong pham vi module product.
  exports: [ProductDomainService],
})
export class ProductModule {}
