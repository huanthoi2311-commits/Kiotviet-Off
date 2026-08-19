import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { BranchModule } from '../branch/branch.module';
import { UserModule } from '../user/user.module';
import { UsageLimitModule } from '../usage-limit/usage-limit.module';
import { WarehouseService } from './application/warehouse.service';
import { WarehousePersistenceModule } from './warehouse-persistence.module';
import { WarehouseController } from './presentation/warehouse.controller';

// T053.05A — BranchModule/UserModule nhập thêm để WarehouseService xác minh branchId/managerId
// (foreign id tenant-owned) thuộc actor.organizationId TRƯỚC khi ghi, tái dùng đúng port công khai
// đã duyệt (BranchService.getById, USER_REPOSITORY.findById — cùng pattern UserService.create đã
// dùng cho branchId) — không tự thêm 1 cách kiểm tra Branch/User thứ hai. Không tạo vòng lặp: cả
// BranchModule lẫn UserModule đều không (trực tiếp hay gián tiếp) import lại WarehouseModule.
// T053.05B — UsageLimitModule (module lá) nhập thêm để PrismaWarehouseRepository khoá/đọc hạn mức
// maxWarehouse trước khi create()/restore().
// T053.05C-2 — WarehousePersistenceModule là chủ sở hữu DUY NHẤT của WAREHOUSE_REPOSITORY (tách ra
// để WarehouseReferenceModule có thể import mà không tạo circular dependency Branch→Warehouse→
// Branch). Import ở đây thay vì tự đăng ký provider. Re-export bằng module class
// (`WarehousePersistenceModule`), KHÔNG export trực tiếp token `WAREHOUSE_REPOSITORY` — Nest's
// `validateExportedProvider` chỉ chấp nhận token export nếu token đó được provide cục bộ.
@Module({
  imports: [
    RbacModule,
    BranchModule,
    UserModule,
    UsageLimitModule,
    WarehousePersistenceModule,
  ],
  controllers: [WarehouseController],
  providers: [WarehouseService],
  // T051.06A — WarehouseService export thêm để Checkout xác minh Warehouse thuộc
  // actor.organizationId trước khi dùng warehouseId để trừ tồn kho. Tái dùng đúng port công khai
  // đã có (findOne(id, organizationId) → NotFoundException nếu sai organizationId), không tạo
  // repository abstraction thứ hai.
  exports: [WarehousePersistenceModule, WarehouseService],
})
export class WarehouseModule {}
