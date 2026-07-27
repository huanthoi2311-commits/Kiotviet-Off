import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { RefundDomainService } from './application/refund-domain.service';
import { ReturnEligibilityService } from './application/return-eligibility.service';
import { SalesReturnService } from './application/sales-return.service';
import { SALES_RETURN_REPOSITORY } from './domain/repositories/sales-return.repository.interface';
import { SALES_RETURN_CODE_GENERATOR } from './domain/services/sales-return-code-generator.interface';
import { SequenceSalesReturnCodeGenerator } from './infrastructure/generators/sequence-sales-return-code.generator';
import { PrismaSalesReturnRepository } from './infrastructure/persistence/prisma-sales-return.repository';
import { SalesReturnController } from './presentation/sales-return.controller';

/**
 * T014 Phase 3 — bổ sung `SalesReturnService`/`ReturnEligibilityService` (Application layer) và
 * import `InvoiceModule`/`ProductModule`/`InventoryModule` để đọc Invoice (đọc-only,
 * `InvoiceService`), Product (đọc-only, `ProductDomainService`) và phục hồi tồn kho
 * (`InventoryDomainService`, chỉ gọi từ `SalesReturnService`, KHÔNG phải Repository —
 * Decision AD46). KHÔNG import `PaymentModule`/`CheckoutModule` (Refund độc lập Payment —
 * Decision AD37; Exchange không có dependency code-level với Checkout — RFC §21).
 *
 * T014 Phase 4 — bổ sung `RefundDomainService` (Refund lifecycle độc lập, KHÔNG ghi Payment,
 * KHÔNG đụng Inventory/Invoice — Decision AD32/AD37/AD43). Không cần import module mới.
 *
 * T014 Phase 5 — bổ sung `SalesReturnController` (REST API cho Return + Refund), import
 * `RbacModule` để dùng `PermissionsGuard`/`@RequirePermissions()` (đúng convention
 * PurchaseReturn/Customer/Supplier).
 */
@Module({
  imports: [InvoiceModule, ProductModule, InventoryModule, RbacModule],
  controllers: [SalesReturnController],
  providers: [
    SalesReturnService,
    ReturnEligibilityService,
    RefundDomainService,
    {
      provide: SALES_RETURN_REPOSITORY,
      useClass: PrismaSalesReturnRepository,
    },
    {
      provide: SALES_RETURN_CODE_GENERATOR,
      useClass: SequenceSalesReturnCodeGenerator,
    },
  ],
  exports: [],
})
export class SalesReturnModule {}
