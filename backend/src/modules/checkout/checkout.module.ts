import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { CustomerModule } from '../customer/customer.module';
import { CustomerPointModule } from '../customer-point/customer-point.module';
import { DiscountModule } from '../discount/discount.module';
import { InventoryModule } from '../inventory/inventory.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { PaymentModule } from '../payment/payment.module';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { UnitModule } from '../unit/unit.module';
import { CheckoutOperationService } from './application/checkout-operation.service';
import { CheckoutService } from './application/checkout.service';
import { CHECKOUT_OPERATION_REPOSITORY } from './domain/repositories/checkout-operation.repository.interface';
import { VOUCHER_REPOSITORY } from './domain/repositories/voucher.repository.interface';
import { PrismaCheckoutOperationRepository } from './infrastructure/persistence/prisma-checkout-operation.repository';
import { PrismaVoucherRepository } from './infrastructure/persistence/prisma-voucher.repository';
import { CheckoutController } from './presentation/checkout.controller';

/**
 * T013 Phase 1 (hạ tầng Idempotency) + Phase 3 (tích hợp vào `CheckoutService`, SPEC
 * §13.2/§14) — `CheckoutService` nay dùng `CartDomainService`/`CustomerPointDomainService`
 * (export từ `CartModule`/`CustomerPointModule` sau Phase 2), không còn inject repository
 * trực tiếp. `CHECKOUT_OPERATION_REPOSITORY` KHÔNG export — chỉ dùng nội bộ module.
 *
 * T013 Phase 5 (Invoice Snapshot) — import thêm `ProductModule`/`UnitModule` để đọc
 * `ProductDomainService`/`UnitDomainService` (đã export sẵn, đúng Repository Boundary) phục vụ
 * snapshot `productCodeSnapshot`/`productNameSnapshot`/`unitNameSnapshot`. Không đổi cấu trúc
 * orchestration đã đóng băng ở AD11 — chỉ bổ sung lookup dữ liệu cục bộ.
 */
@Module({
  imports: [
    RbacModule,
    CartModule,
    CustomerModule,
    CustomerPointModule,
    InventoryModule,
    DiscountModule,
    InvoiceModule,
    PaymentModule,
    ProductModule,
    UnitModule,
  ],
  controllers: [CheckoutController],
  providers: [
    CheckoutService,
    { provide: VOUCHER_REPOSITORY, useClass: PrismaVoucherRepository },
    CheckoutOperationService,
    {
      provide: CHECKOUT_OPERATION_REPOSITORY,
      useClass: PrismaCheckoutOperationRepository,
    },
  ],
})
export class CheckoutModule {}
