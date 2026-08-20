import { Module } from '@nestjs/common';
import { CategoryPersistenceModule } from './category-persistence.module';
import { CategoryReferenceService } from './application/category-reference.service';

/**
 * T053.05C-2 — Read-only reference capability cho module khác (cùng pattern `UserReferenceModule`,
 * `WarehouseReferenceModule`). Chỉ export `CategoryReferenceService` — không export
 * `CATEGORY_REPOSITORY`, không chứa `CategoryService`/write use case/Controller nào. Import
 * `CategoryPersistenceModule` để có `CATEGORY_REPOSITORY` — KHÔNG import `ProductModule`/
 * `RbacModule` (điều kiện tránh circular dependency — `CategoryModule` đầy đủ đã import
 * `ProductModule`, nên `ProductModule` không thể import lại bất kỳ thứ gì kéo theo nó).
 */
@Module({
  imports: [CategoryPersistenceModule],
  providers: [CategoryReferenceService],
  exports: [CategoryReferenceService],
})
export class CategoryReferenceModule {}
