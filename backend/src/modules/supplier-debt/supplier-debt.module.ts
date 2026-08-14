import { Module } from '@nestjs/common';
import { BranchModule } from '../branch/branch.module';
import { RbacModule } from '../rbac/rbac.module';
import { SupplierModule } from '../supplier/supplier.module';
import { SupplierDebtService } from './application/supplier-debt.service';
import { SUPPLIER_DEBT_REPOSITORY } from './domain/repositories/supplier-debt.repository.interface';
import { PrismaSupplierDebtRepository } from './infrastructure/persistence/prisma-supplier-debt.repository';
import { SupplierDebtController } from './presentation/supplier-debt.controller';
import { SupplierPaymentController } from './presentation/supplier-payment.controller';

@Module({
  // T052.01 — BranchModule thêm để xác minh branchId thuộc actor.organizationId trước khi tạo
  // Payment (cùng đúng pattern đã duyệt ở T051.06A cho Checkout/PurchaseOrder — tái dùng port
  // công khai `BranchService.getById(id, actor)`, không tạo repository abstraction thứ hai).
  imports: [RbacModule, SupplierModule, BranchModule],
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
