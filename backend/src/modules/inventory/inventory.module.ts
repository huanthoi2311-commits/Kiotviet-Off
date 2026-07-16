import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { InventoryDomainService } from './application/inventory-domain.service';
import { InventoryService } from './application/inventory.service';
import { INVENTORY_REPOSITORY } from './domain/repositories/inventory.repository.interface';
import { PrismaInventoryRepository } from './infrastructure/persistence/prisma-inventory.repository';
import { InventoryController } from './presentation/inventory.controller';

/**
 * `INVENTORY_REPOSITORY` KHÔNG được export (Decision 4/8, SPEC-INV-001) — Repository là chi
 * tiết triển khai nội bộ. Module khác chỉ được import module này để inject
 * `InventoryDomainService` — cửa ngõ ghi tồn kho duy nhất (Single Writer, không ngoại lệ).
 */
@Module({
  imports: [RbacModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryDomainService,
    { provide: INVENTORY_REPOSITORY, useClass: PrismaInventoryRepository },
  ],
  exports: [InventoryDomainService],
})
export class InventoryModule {}
