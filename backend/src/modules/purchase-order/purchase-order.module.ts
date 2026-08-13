import { Module } from '@nestjs/common';
import { BranchModule } from '../branch/branch.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { SupplierModule } from '../supplier/supplier.module';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { PurchaseOrderService } from './application/purchase-order.service';
import { PURCHASE_ORDER_REPOSITORY } from './domain/repositories/purchase-order.repository.interface';
import { PURCHASE_ORDER_CODE_GENERATOR } from './domain/services/purchase-order-code-generator.interface';
import { SequencePurchaseOrderCodeGenerator } from './infrastructure/generators/sequence-purchase-order-code.generator';
import { PrismaPurchaseOrderRepository } from './infrastructure/persistence/prisma-purchase-order.repository';
import { PurchaseOrderController } from './presentation/purchase-order.controller';

/**
 * T051.06B — import thêm `BranchModule`/`SupplierModule`/`WarehouseModule`/`ProductModule` để đọc
 * `BranchService`/`SupplierDomainService`/`WarehouseService`/`ProductDomainService` (đọc thuần,
 * xác minh organizationId trước khi dùng branchId/supplierId/warehouseId/productId trong business
 * write) — vá lỗ hổng tenant-isolation đã xác nhận, cùng pattern T051.06A (Checkout).
 */
@Module({
  imports: [
    RbacModule,
    InventoryModule,
    BranchModule,
    SupplierModule,
    WarehouseModule,
    ProductModule,
  ],
  controllers: [PurchaseOrderController],
  providers: [
    PurchaseOrderService,
    {
      provide: PURCHASE_ORDER_REPOSITORY,
      useClass: PrismaPurchaseOrderRepository,
    },
    {
      provide: PURCHASE_ORDER_CODE_GENERATOR,
      useClass: SequencePurchaseOrderCodeGenerator,
    },
  ],
  exports: [PURCHASE_ORDER_REPOSITORY],
})
export class PurchaseOrderModule {}
