import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { InventoryAdjustmentService } from './application/inventory-adjustment.service';
import { INVENTORY_ADJUSTMENT_REPOSITORY } from './domain/repositories/inventory-adjustment.repository.interface';
import { INVENTORY_ADJUSTMENT_CODE_GENERATOR } from './domain/services/inventory-adjustment-code-generator.interface';
import { SequenceInventoryAdjustmentCodeGenerator } from './infrastructure/generators/sequence-inventory-adjustment-code.generator';
import { PrismaInventoryAdjustmentRepository } from './infrastructure/persistence/prisma-inventory-adjustment.repository';
import { InventoryAdjustmentController } from './presentation/inventory-adjustment.controller';

/**
 * T051.06B — import thêm `WarehouseModule`/`ProductModule` để đọc `WarehouseService`/
 * `ProductDomainService` (đọc thuần, xác minh organizationId trước khi dùng warehouseId/
 * items[].productId trong business write) — vá lỗ hổng tenant-isolation đã xác nhận, cùng pattern
 * T051.06A (Checkout)/T051.06B Gate A/B/C.
 */
@Module({
  imports: [RbacModule, InventoryModule, WarehouseModule, ProductModule],
  controllers: [InventoryAdjustmentController],
  providers: [
    InventoryAdjustmentService,
    {
      provide: INVENTORY_ADJUSTMENT_REPOSITORY,
      useClass: PrismaInventoryAdjustmentRepository,
    },
    {
      provide: INVENTORY_ADJUSTMENT_CODE_GENERATOR,
      useClass: SequenceInventoryAdjustmentCodeGenerator,
    },
  ],
  exports: [INVENTORY_ADJUSTMENT_REPOSITORY],
})
export class InventoryAdjustmentModule {}
