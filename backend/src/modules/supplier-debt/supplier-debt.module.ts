import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupplierModule } from '../supplier/supplier.module';
import { SupplierDebtService } from './application/supplier-debt.service';
import { SUPPLIER_DEBT_REPOSITORY } from './domain/repositories/supplier-debt.repository.interface';
import { PrismaSupplierDebtRepository } from './infrastructure/persistence/prisma-supplier-debt.repository';
import { SupplierDebtController } from './presentation/supplier-debt.controller';
import { SupplierPaymentController } from './presentation/supplier-payment.controller';

@Module({
  imports: [RbacModule, SupplierModule],
  controllers: [SupplierDebtController, SupplierPaymentController],
  providers: [
    SupplierDebtService,
    {
      provide: SUPPLIER_DEBT_REPOSITORY,
      useClass: PrismaSupplierDebtRepository,
    },
  ],
  exports: [SUPPLIER_DEBT_REPOSITORY],
})
export class SupplierDebtModule {}
