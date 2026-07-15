import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { PaymentService } from './application/payment.service';
import { PAYMENT_REPOSITORY } from './domain/repositories/payment.repository.interface';
import { PrismaPaymentRepository } from './infrastructure/persistence/prisma-payment.repository';
import { PaymentController } from './presentation/payment.controller';

@Module({
  imports: [RbacModule],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    { provide: PAYMENT_REPOSITORY, useClass: PrismaPaymentRepository },
  ],
  exports: [PaymentService, PAYMENT_REPOSITORY],
})
export class PaymentModule {}
