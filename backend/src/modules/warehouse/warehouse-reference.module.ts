import { Module } from '@nestjs/common';
import { WarehousePersistenceModule } from './warehouse-persistence.module';
import { WarehouseReferenceService } from './application/warehouse-reference.service';

/**
 * T053.05C-2 — Read-only reference capability cho module khác (cùng pattern `UserReferenceModule`,
 * `BarcodeReferenceModule`). Chỉ export `WarehouseReferenceService` — không export
 * `WAREHOUSE_REPOSITORY`, không chứa `WarehouseService`/write use case/Controller nào. Import
 * `WarehousePersistenceModule` để có `WAREHOUSE_REPOSITORY` — KHÔNG import `BranchModule`/
 * `UserModule`/`UsageLimitModule`/`RbacModule` (điều kiện tránh circular dependency —
 * `WarehouseModule` đầy đủ đã import `BranchModule`, nên `BranchModule` không thể import lại bất
 * kỳ thứ gì kéo theo nó).
 */
@Module({
  imports: [WarehousePersistenceModule],
  providers: [WarehouseReferenceService],
  exports: [WarehouseReferenceService],
})
export class WarehouseReferenceModule {}
