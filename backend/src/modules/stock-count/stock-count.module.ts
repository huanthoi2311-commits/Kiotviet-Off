import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { StockCountService } from './application/stock-count.service';
import { STOCK_COUNT_REPOSITORY } from './domain/repositories/stock-count.repository.interface';
import { STOCK_COUNT_CODE_GENERATOR } from './domain/services/stock-count-code-generator.interface';
import { SequenceStockCountCodeGenerator } from './infrastructure/generators/sequence-stock-count-code.generator';
import { PrismaStockCountRepository } from './infrastructure/persistence/prisma-stock-count.repository';
import { StockCountController } from './presentation/stock-count.controller';

/**
 * T051.06B — import thêm `WarehouseModule`/`ProductModule` để đọc `WarehouseService`/
 * `ProductDomainService` (đọc thuần, xác minh organizationId trước khi dùng warehouseId/
 * productIds trong business write) — vá lỗ hổng tenant-isolation đã xác nhận, cùng pattern
 * T051.06A (Checkout)/T051.06B Gate A/B. Lớp phòng thủ thứ hai (repository snapshot tồn kho) nằm
 * ở `PrismaStockCountRepository.create()`.
 */
@Module({
  imports: [RbacModule, InventoryModule, WarehouseModule, ProductModule],
  controllers: [StockCountController],
  providers: [
    StockCountService,
    { provide: STOCK_COUNT_REPOSITORY, useClass: PrismaStockCountRepository },
    {
      provide: STOCK_COUNT_CODE_GENERATOR,
      useClass: SequenceStockCountCodeGenerator,
    },
  ],
  exports: [STOCK_COUNT_REPOSITORY],
})
export class StockCountModule {}
