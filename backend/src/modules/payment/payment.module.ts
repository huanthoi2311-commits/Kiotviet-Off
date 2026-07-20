import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { PaymentService } from './application/payment.service';
import { PAYMENT_REPOSITORY } from './domain/repositories/payment.repository.interface';
import { PrismaPaymentRepository } from './infrastructure/persistence/prisma-payment.repository';
import { PaymentController } from './presentation/payment.controller';

/**
 * T013 Phase 2 (SPEC-T013-SALES-FOUNDATION-001 §9.3, ADR-0010 — Repository Boundary) —
 * `PAYMENT_REPOSITORY` KHÔNG còn export. `PaymentService` là public application port duy nhất
 * (đã đóng vai trò Domain Service từ trước — chỉ có `getById`/`getByInvoiceId`/`createPayment`
 * nội bộ, không có CRUD riêng cần tách thêm 1 class khác).
 */
@Module({
  imports: [RbacModule],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    { provide: PAYMENT_REPOSITORY, useClass: PrismaPaymentRepository },
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
