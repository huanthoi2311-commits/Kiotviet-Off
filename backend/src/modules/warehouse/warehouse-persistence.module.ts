import { Module } from '@nestjs/common';
import { WAREHOUSE_REPOSITORY } from './domain/repositories/warehouse.repository.interface';
import { PrismaWarehouseRepository } from './infrastructure/persistence/prisma-warehouse.repository';

/**
 * T053.05C-2 — Hạ tầng thuần túy (cùng mẫu Persistence Module đã dùng cho User/Barcode, Decision
 * RPC01 — không lặp lại tên lớp cụ thể ở đây để tránh false-positive dạng text-scan, xem tiền lệ
 * T005/T006/T009). Registration owner DUY NHẤT của `WAREHOUSE_REPOSITORY`. Không chứa Controller/
 * Application Service/business rule. Không import module nghiệp vụ nào (không `BranchModule`,
 * không `UserModule`, không `WarehouseModule` đầy đủ) — điều kiện để `WarehouseReferenceModule`
 * (xây trên module này) có thể import được từ `BranchModule` mà không tạo circular dependency
 * (Branch→Warehouse→Branch, vì `WarehouseModule` đầy đủ đã import `BranchModule` từ T053.05A).
 *
 * `WarehouseModule` đầy đủ tiếp tục import module này thay vì tự đăng ký `WAREHOUSE_REPOSITORY` —
 * KHÔNG đổi hành vi, chỉ đổi nơi đăng ký (single source of truth, không nhân đôi provider).
 */
@Module({
  providers: [
    { provide: WAREHOUSE_REPOSITORY, useClass: PrismaWarehouseRepository },
  ],
  exports: [WAREHOUSE_REPOSITORY],
})
export class WarehousePersistenceModule {}
