import { Module } from '@nestjs/common';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { CategoryService } from './application/category.service';
import { CATEGORY_REPOSITORY } from './domain/repositories/category.repository.interface';
import { CATEGORY_SLUG_GENERATOR } from './domain/services/category-slug-generator.interface';
import { CategorySlugifySlugGenerator } from './infrastructure/generators/category-slugify-slug.generator';
import { PrismaCategoryRepository } from './infrastructure/persistence/prisma-category.repository';
import { CategoryController } from './presentation/category.controller';

@Module({
  imports: [RbacModule, ProductModule],
  controllers: [CategoryController],
  providers: [
    CategoryService,
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
    {
      provide: CATEGORY_SLUG_GENERATOR,
      useClass: CategorySlugifySlugGenerator,
    },
  ],
  exports: [CATEGORY_REPOSITORY],
})
export class CategoryModule {}
