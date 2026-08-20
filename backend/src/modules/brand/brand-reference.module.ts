import { Module } from '@nestjs/common';
import { BrandPersistenceModule } from './brand-persistence.module';
import { BrandReferenceService } from './application/brand-reference.service';

/**
 * T053.05C-2 — Read-only reference capability cho module khác (cùng pattern
 * `CategoryReferenceModule`). Chỉ export `BrandReferenceService` — không export
 * `BRAND_REPOSITORY`, không chứa `BrandService`/write use case/Controller nào. Import
 * `BrandPersistenceModule` để có `BRAND_REPOSITORY` — KHÔNG import `ProductModule`/`RbacModule`
 * (điều kiện tránh circular dependency — `BrandModule` đầy đủ đã import `ProductModule`, nên
 * `ProductModule` không thể import lại bất kỳ thứ gì kéo theo nó).
 */
@Module({
  imports: [BrandPersistenceModule],
  providers: [BrandReferenceService],
  exports: [BrandReferenceService],
})
export class BrandReferenceModule {}
