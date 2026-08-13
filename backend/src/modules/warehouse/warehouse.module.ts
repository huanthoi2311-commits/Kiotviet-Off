import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { WarehouseService } from './application/warehouse.service';
import { WAREHOUSE_REPOSITORY } from './domain/repositories/warehouse.repository.interface';
import { PrismaWarehouseRepository } from './infrastructure/persistence/prisma-warehouse.repository';
import { WarehouseController } from './presentation/warehouse.controller';

@Module({
  imports: [RbacModule],
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
