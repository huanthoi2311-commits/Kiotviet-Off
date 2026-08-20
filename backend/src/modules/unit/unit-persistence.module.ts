import { Module } from '@nestjs/common';
import { UNIT_REPOSITORY } from './domain/repositories/unit.repository.interface';
import { PrismaUnitRepository } from './infrastructure/persistence/prisma-unit.repository';

/**
 * T053.05C-2 — Hạ tầng thuần túy (cùng mẫu Persistence Module đã dùng cho Barcode/Category, Decision
 * RPC01 — không lặp lại tên lớp cụ thể ở đây để tránh false-positive dạng text-scan, xem tiền lệ
 * T005/T006/T009). Registration owner DUY NHẤT của `UNIT_REPOSITORY`. Không chứa Controller/
 * Application Service/business rule. Không import module nghiệp vụ nào (không `ProductModule`,
 * không `UnitModule` đầy đủ) — điều kiện để `UnitReferenceModule` (xây trên module này) có thể
 * import được từ `ProductModule` mà không tạo circular dependency (Product→Unit→Product, vì
 * `UnitModule` đầy đủ đã import `ProductModule`).
 *
 * `UnitModule` đầy đủ tiếp tục import module này thay vì tự đăng ký `UNIT_REPOSITORY` — KHÔNG đổi
 * hành vi, chỉ đổi nơi đăng ký (single source of truth, không nhân đôi provider). `UnitService`
 * tiếp tục inject `UNIT_REPOSITORY` trực tiếp (không đổi write logic — cùng Decision RPC04 áp
 * dụng cho Barcode).
 */
@Module({
  providers: [{ provide: UNIT_REPOSITORY, useClass: PrismaUnitRepository }],
  exports: [UNIT_REPOSITORY],
})
export class UnitPersistenceModule {}
