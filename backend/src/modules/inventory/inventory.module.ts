import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { InventoryService } from './application/inventory.service';
import { INVENTORY_REPOSITORY } from './domain/repositories/inventory.repository.interface';
import { PrismaInventoryRepository } from './infrastructure/persistence/prisma-inventory.repository';
import { InventoryController } from './presentation/inventory.controller';

@Module({
  imports: [RbacModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    { provide: INVENTORY_REPOSITORY, useClass: PrismaInventoryRepository },
  ],
  exports: [INVENTORY_REPOSITORY],
})
export class InventoryModule {}
