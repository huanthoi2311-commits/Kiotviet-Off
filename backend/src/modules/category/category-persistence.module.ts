import { Module } from '@nestjs/common';
import { CATEGORY_REPOSITORY } from './domain/repositories/category.repository.interface';
import { PrismaCategoryRepository } from './infrastructure/persistence/prisma-category.repository';

/**
 * T053.05C-2 — Hạ tầng thuần túy (cùng pattern `UserPersistenceModule`/`WarehousePersistenceModule`,
 * Decision RPC01). Registration owner DUY NHẤT của `CATEGORY_REPOSITORY`. Không chứa Controller/
 * Application Service/business rule. Không import module nghiệp vụ nào (không `ProductModule`,
 * không `CategoryModule` đầy đủ) — điều kiện để `CategoryReferenceModule` (xây trên module này) có
 * thể import được từ `ProductModule` mà không tạo circular dependency (Product→Category→Product,
 * vì `CategoryModule` đầy đủ đã import `ProductModule`).
 *
 * `CategoryModule` đầy đủ tiếp tục import module này thay vì tự đăng ký `CATEGORY_REPOSITORY` —
 * KHÔNG đổi hành vi, chỉ đổi nơi đăng ký (single source of truth, không nhân đôi provider).
 */
@Module({
  providers: [
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
  ],
  exports: [CATEGORY_REPOSITORY],
})
export class CategoryPersistenceModule {}
