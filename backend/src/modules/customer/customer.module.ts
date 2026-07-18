import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { CustomerDomainService } from './application/customer-domain.service';
import { CustomerService } from './application/customer.service';
import { CustomerPointSubscriber } from './application/subscribers/customer-point.subscriber';
import { CUSTOMER_REPOSITORY } from './domain/repositories/customer.repository.interface';
import { CUSTOMER_CODE_GENERATOR } from './domain/services/customer-code-generator.interface';
import { SequenceCustomerCodeGenerator } from './infrastructure/generators/sequence-customer-code.generator';
import { PrismaCustomerRepository } from './infrastructure/persistence/prisma-customer.repository';
import { CustomerController } from './presentation/customer.controller';

/**
 * T011 (Decision CR08/SR04, ADR-0010 — Repository Boundary) — `CUSTOMER_REPOSITORY` KHÔNG còn
 * export. `checkout`/`customer-point` phải phụ thuộc `CustomerDomainService` (public application
 * port), không phụ thuộc repository token/persistence contract trực tiếp.
 */
@Module({
  imports: [RbacModule],
  controllers: [CustomerController],
  providers: [
    CustomerService,
    CustomerDomainService,
    CustomerPointSubscriber,
    {
      provide: CUSTOMER_REPOSITORY,
      useClass: PrismaCustomerRepository,
    },
    {
      provide: CUSTOMER_CODE_GENERATOR,
      useClass: SequenceCustomerCodeGenerator,
    },
  ],
  exports: [CustomerDomainService],
})
export class CustomerModule {}
