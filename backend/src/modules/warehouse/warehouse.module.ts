import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { BranchModule } from '../branch/branch.module';
import { UserModule } from '../user/user.module';
import { WarehouseService } from './application/warehouse.service';
import { WAREHOUSE_REPOSITORY } from './domain/repositories/warehouse.repository.interface';
import { PrismaWarehouseRepository } from './infrastructure/persistence/prisma-warehouse.repository';
import { WarehouseController } from './presentation/warehouse.controller';

// T053.05A — BranchModule/UserModule nhập thêm để WarehouseService xác minh branchId/managerId
// (foreign id tenant-owned) thuộc actor.organizationId TRƯỚC khi ghi, tái dùng đúng port công khai
// đã duyệt (BranchService.getById, USER_REPOSITORY.findById — cùng pattern UserService.create đã
// dùng cho branchId) — không tự thêm 1 cách kiểm tra Branch/User thứ hai. Không tạo vòng lặp: cả
// BranchModule lẫn UserModule đều không (trực tiếp hay gián tiếp) import lại WarehouseModule.
@Module({
  imports: [RbacModule, BranchModule, UserModule],
  controllers: [WarehouseController],
  providers: [
    WarehouseService,
    { provide: WAREHOUSE_REPOSITORY, useClass: PrismaWarehouseRepository },
  ],
  // T051.06A — WarehouseService export thêm để Checkout xác minh Warehouse thuộc
  // actor.organizationId trước khi dùng warehouseId để trừ tồn kho. Tái dùng đúng port công khai
  // đã có (findOne(id, organizationId) → NotFoundException nếu sai organizationId), không tạo
  // repository abstraction thứ hai.
  exports: [WAREHOUSE_REPOSITORY, WarehouseService],
})
export class WarehouseModule {}
