import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { CustomerService } from './application/customer.service';
import { CUSTOMER_REPOSITORY } from './domain/repositories/customer.repository.interface';
import { CUSTOMER_CODE_GENERATOR } from './domain/services/customer-code-generator.interface';
import { SequenceCustomerCodeGenerator } from './infrastructure/generators/sequence-customer-code.generator';
import { PrismaCustomerRepository } from './infrastructure/persistence/prisma-customer.repository';
import { CustomerController } from './presentation/customer.controller';

@Module({
  imports: [RbacModule],
  controllers: [CustomerController],
  providers: [
    CustomerService,
    {
      provide: CUSTOMER_REPOSITORY,
      useClass: PrismaCustomerRepository,
    },
    {
      provide: CUSTOMER_CODE_GENERATOR,
      useClass: SequenceCustomerCodeGenerator,
    },
  ],
  exports: [CUSTOMER_REPOSITORY],
})
export class CustomerModule {}
