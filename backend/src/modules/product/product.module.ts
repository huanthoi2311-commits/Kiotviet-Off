import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { ProductService } from './application/product.service';
import { ProductDomainService } from './application/product-domain.service';
import { PRODUCT_REPOSITORY } from './domain/repositories/product.repository.interface';
import { SKU_GENERATOR } from './domain/services/sku-generator.interface';
import { SLUG_GENERATOR } from './domain/services/slug-generator.interface';
import { SequenceSkuGenerator } from './infrastructure/generators/sequence-sku.generator';
import { SlugifySlugGenerator } from './infrastructure/generators/slugify-slug.generator';
import { PrismaProductRepository } from './infrastructure/persistence/prisma-product.repository';
import { ProductController } from './presentation/product.controller';

@Module({
  imports: [RbacModule],
  controllers: [ProductController],
  providers: [
    ProductService,
    ProductDomainService,
    { provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository },
    { provide: SKU_GENERATOR, useClass: SequenceSkuGenerator },
    { provide: SLUG_GENERATOR, useClass: SlugifySlugGenerator },
  ],
  // PRODUCT_REPOSITORY van con export tam thoi - se go bo o Commit 6 (SPEC-PRODUCT-001 SS7.2,
  // ADR-0010), sau khi ca 5 module phu thuoc da chuyen sang inject ProductDomainService (Decision
  // C02: khong go som de tranh vo DI runtime cua 5 module chua kip cap nhat trong cac commit giua).
  exports: [ProductDomainService, PRODUCT_REPOSITORY],
})
export class ProductModule {}
