import { Module } from '@nestjs/common';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module';
import { RbacModule } from '../rbac/rbac.module';
import { PurchaseReturnService } from './application/purchase-return.service';
import { PURCHASE_RETURN_REPOSITORY } from './domain/repositories/purchase-return.repository.interface';
import { PURCHASE_RETURN_CODE_GENERATOR } from './domain/services/purchase-return-code-generator.interface';
import { SequencePurchaseReturnCodeGenerator } from './infrastructure/generators/sequence-purchase-return-code.generator';
import { PrismaPurchaseReturnRepository } from './infrastructure/persistence/prisma-purchase-return.repository';
import { PurchaseReturnController } from './presentation/purchase-return.controller';

/**
 * T053.06H — `EntitlementModule` là leaf module (chỉ phụ thuộc PrismaService đã Global, import 1
 * chiều không tạo vòng lặp). `PurchaseReturnController` vừa gắn `EntitlementGuard` vào
 * `@UseGuards()` — thiếu import này khiến Nest DI không resolve được `EntitlementGuard`, sập ngay
 * ở bootstrap (`NestFactory.create()`), phát hiện qua CI E2E job thất bại ở bước Export OpenAPI.
 */
@Module({
  imports: [RbacModule, EntitlementModule, PurchaseOrderModule, InventoryModule],
  controllers: [PurchaseReturnController],
  providers: [
    PurchaseReturnService,
    {
      provide: PURCHASE_RETURN_REPOSITORY,
      useClass: PrismaPurchaseReturnRepository,
    },
    {
      provide: PURCHASE_RETURN_CODE_GENERATOR,
      useClass: SequencePurchaseReturnCodeGenerator,
    },
  ],
  exports: [PURCHASE_RETURN_REPOSITORY],
})
export class PurchaseReturnModule {}
