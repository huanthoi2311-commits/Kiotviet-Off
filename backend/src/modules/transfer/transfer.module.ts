import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { TransferService } from './application/transfer.service';
import { TRANSFER_REPOSITORY } from './domain/repositories/transfer.repository.interface';
import { TRANSFER_CODE_GENERATOR } from './domain/services/transfer-code-generator.interface';
import { SequenceTransferCodeGenerator } from './infrastructure/generators/sequence-transfer-code.generator';
import { PrismaTransferRepository } from './infrastructure/persistence/prisma-transfer.repository';
import { TransferController } from './presentation/transfer.controller';

/**
 * T051.06B — import thêm `WarehouseModule`/`ProductModule` để đọc `WarehouseService`/
 * `ProductDomainService` (đọc thuần, xác minh organizationId trước khi dùng fromWarehouseId/
 * toWarehouseId/productId trong business write) — vá lỗ hổng tenant-isolation đã xác nhận, cùng
 * pattern T051.06A (Checkout) / T051.06B Gate A (Purchase Order).
 */
@Module({
  imports: [RbacModule, InventoryModule, WarehouseModule, ProductModule],
  controllers: [TransferController],
  providers: [
    TransferService,
    { provide: TRANSFER_REPOSITORY, useClass: PrismaTransferRepository },
    {
      provide: TRANSFER_CODE_GENERATOR,
      useClass: SequenceTransferCodeGenerator,
    },
  ],
  exports: [TRANSFER_REPOSITORY],
})
export class TransferModule {}
