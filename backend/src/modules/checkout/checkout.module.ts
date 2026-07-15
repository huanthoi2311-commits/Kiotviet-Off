import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { CustomerModule } from '../customer/customer.module';
import { CustomerPointModule } from '../customer-point/customer-point.module';
import { DiscountModule } from '../discount/discount.module';
import { InventoryModule } from '../inventory/inventory.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { PaymentModule } from '../payment/payment.module';
import { RbacModule } from '../rbac/rbac.module';
import { CheckoutService } from './application/checkout.service';
import { VOUCHER_REPOSITORY } from './domain/repositories/voucher.repository.interface';
import { PrismaVoucherRepository } from './infrastructure/persistence/prisma-voucher.repository';
import { CheckoutController } from './presentation/checkout.controller';

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
  ],
  controllers: [CheckoutController],
  providers: [
    CheckoutService,
    { provide: VOUCHER_REPOSITORY, useClass: PrismaVoucherRepository },
  ],
})
export class CheckoutModule {}
