import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { PurchaseOrderService } from './application/purchase-order.service';
import { PURCHASE_ORDER_REPOSITORY } from './domain/repositories/purchase-order.repository.interface';
import { PURCHASE_ORDER_CODE_GENERATOR } from './domain/services/purchase-order-code-generator.interface';
import { SequencePurchaseOrderCodeGenerator } from './infrastructure/generators/sequence-purchase-order-code.generator';
import { PrismaPurchaseOrderRepository } from './infrastructure/persistence/prisma-purchase-order.repository';
import { PurchaseOrderController } from './presentation/purchase-order.controller';

@Module({
  imports: [RbacModule],
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
