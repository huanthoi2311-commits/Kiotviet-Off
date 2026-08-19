import { Module } from '@nestjs/common';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { CategoryService } from './application/category.service';
import { CATEGORY_SLUG_GENERATOR } from './domain/services/category-slug-generator.interface';
import { CategorySlugifySlugGenerator } from './infrastructure/generators/category-slugify-slug.generator';
import { CategoryPersistenceModule } from './category-persistence.module';
import { CategoryController } from './presentation/category.controller';

// T053.05C-2 — CategoryPersistenceModule là chủ sở hữu DUY NHẤT của CATEGORY_REPOSITORY (tách ra để
// CategoryReferenceModule có thể import mà không tạo circular dependency Product→Category→Product).
// Import ở đây thay vì tự đăng ký provider. Re-export bằng module class (`CategoryPersistenceModule`),
// KHÔNG export trực tiếp token `CATEGORY_REPOSITORY` — Nest's `validateExportedProvider` chỉ chấp
// nhận token export nếu token đó được provide cục bộ.
@Module({
  imports: [RbacModule, ProductModule, CategoryPersistenceModule],
  controllers: [CategoryController],
  providers: [
    CategoryService,
    {
      provide: CATEGORY_SLUG_GENERATOR,
      useClass: CategorySlugifySlugGenerator,
    },
  ],
  exports: [CategoryPersistenceModule],
})
export class CategoryModule {}
