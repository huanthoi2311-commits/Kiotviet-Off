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
  exports: [WAREHOUSE_REPOSITORY],
})
export class WarehouseModule {}
