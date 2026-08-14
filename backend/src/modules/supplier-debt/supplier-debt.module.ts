import { Module } from '@nestjs/common';
import { BranchModule } from '../branch/branch.module';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module';
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
  // T052.01C — PurchaseOrderModule thêm để xác minh purchaseOrderId (tùy chọn) thuộc
  // actor.organizationId — PurchaseOrderModule CHỦ Ý chỉ export PURCHASE_ORDER_REPOSITORY (không
  // export PurchaseOrderService), đúng pattern cross-module ĐÃ CÓ SẴN từ trước
  // (`PurchaseReturnService` dùng chính xác cùng cách — xem `purchase-return.module.ts`/
  // `purchase-return.service.ts`) — tái dùng nguyên trạng, không phát minh boundary mới.
  imports: [RbacModule, SupplierModule, BranchModule, PurchaseOrderModule],
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
