import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { ProductService } from './application/product.service';
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
    { provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository },
    { provide: SKU_GENERATOR, useClass: SequenceSkuGenerator },
    { provide: SLUG_GENERATOR, useClass: SlugifySlugGenerator },
  ],
  exports: [PRODUCT_REPOSITORY],
})
export class ProductModule {}
