import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { RbacModule } from '../rbac/rbac.module';
import { StockCountService } from './application/stock-count.service';
import { STOCK_COUNT_REPOSITORY } from './domain/repositories/stock-count.repository.interface';
import { STOCK_COUNT_CODE_GENERATOR } from './domain/services/stock-count-code-generator.interface';
import { SequenceStockCountCodeGenerator } from './infrastructure/generators/sequence-stock-count-code.generator';
import { PrismaStockCountRepository } from './infrastructure/persistence/prisma-stock-count.repository';
import { StockCountController } from './presentation/stock-count.controller';

@Module({
  imports: [RbacModule, InventoryModule],
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
