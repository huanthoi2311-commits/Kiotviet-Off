import { Module } from '@nestjs/common';
import { BranchModule } from '../branch/branch.module';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module';
import { RbacModule } from '../rbac/rbac.module';
import { SupplierModule } from '../supplier/supplier.module';
import { SupplierDebtService } from './application/supplier-debt.service';
import { SupplierPaymentOperationService } from './application/supplier-payment-operation.service';
import { SUPPLIER_DEBT_REPOSITORY } from './domain/repositories/supplier-debt.repository.interface';
import { SUPPLIER_PAYMENT_OPERATION_REPOSITORY } from './domain/repositories/supplier-payment-operation.repository.interface';
import { PrismaSupplierDebtRepository } from './infrastructure/persistence/prisma-supplier-debt.repository';
import { PrismaSupplierPaymentOperationRepository } from './infrastructure/persistence/prisma-supplier-payment-operation.repository';
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
    // T052.05B — module-local, mirror Checkout's own operation-repository DI token pattern
    // (T013): KHÔNG export, chỉ dùng nội bộ (SupplierPaymentOperationService +
    // PrismaSupplierDebtRepository, để gọi markCompleted() trong cùng transaction với
    // Payment.create()).
    SupplierPaymentOperationService,
    {
      provide: SUPPLIER_PAYMENT_OPERATION_REPOSITORY,
      useClass: PrismaSupplierPaymentOperationRepository,
    },
  ],
  exports: [SUPPLIER_DEBT_REPOSITORY],
})
export class SupplierDebtModule {}
