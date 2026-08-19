import { Module } from '@nestjs/common';
import { BRAND_REPOSITORY } from './domain/repositories/brand.repository.interface';
import { PrismaBrandRepository } from './infrastructure/persistence/prisma-brand.repository';

/**
 * T053.05C-2 — Hạ tầng thuần túy (cùng pattern `CategoryPersistenceModule`, Decision RPC01).
 * Registration owner DUY NHẤT của `BRAND_REPOSITORY`. Không chứa Controller/Application Service/
 * business rule. Không import module nghiệp vụ nào (không `ProductModule`, không `BrandModule` đầy
 * đủ) — điều kiện để `BrandReferenceModule` (xây trên module này) có thể import được từ
 * `ProductModule` mà không tạo circular dependency (Product→Brand→Product, vì `BrandModule` đầy đủ
 * đã import `ProductModule`).
 *
 * `BrandModule` đầy đủ tiếp tục import module này thay vì tự đăng ký `BRAND_REPOSITORY` — KHÔNG đổi
 * hành vi, chỉ đổi nơi đăng ký (single source of truth, không nhân đôi provider).
 */
@Module({
  providers: [{ provide: BRAND_REPOSITORY, useClass: PrismaBrandRepository }],
  exports: [BRAND_REPOSITORY],
})
export class BrandPersistenceModule {}
