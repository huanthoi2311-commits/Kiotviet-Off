import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { WarehouseModule } from '../warehouse/warehouse.module';
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
 *
 * T053.05C-1 — bổ sung `WarehouseModule` để `SalesReturnService` xác minh `warehouseId` (foreign
 * id tenant-owned) thuộc `actor.organizationId` TRƯỚC khi ghi `SalesReturnItem`, tái dùng đúng
 * port công khai đã duyệt (`WarehouseService.findOne(id, organizationId)`, cùng pattern Checkout/
 * PurchaseOrder/InventoryAdjustment/Transfer/StockCount đã dùng). Không tạo vòng lặp: đã truy vết
 * toàn bộ transitive import của `WarehouseModule` (RbacModule, BranchModule, UserModule,
 * UsageLimitModule, và cấp tiếp theo AuthModule/EntitlementModule/OrganizationModule) — không có
 * module nào trong tập đó import lại SalesReturnModule/InventoryModule/InvoiceModule/ProductModule.
 */
@Module({
  imports: [
    InvoiceModule,
    ProductModule,
    InventoryModule,
    RbacModule,
    WarehouseModule,
  ],
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
