import { Module } from '@nestjs/common';
import { CustomerModule } from '../customer/customer.module';
import { RbacModule } from '../rbac/rbac.module';
import { CustomerPointService } from './application/customer-point.service';
import { CUSTOMER_POINT_REPOSITORY } from './domain/repositories/customer-point.repository.interface';
import { PrismaCustomerPointRepository } from './infrastructure/persistence/prisma-customer-point.repository';
import { CustomerPointController } from './presentation/customer-point.controller';

@Module({
  imports: [RbacModule, CustomerModule],
  controllers: [CustomerPointController],
  providers: [
    CustomerPointService,
    {
      provide: CUSTOMER_POINT_REPOSITORY,
      useClass: PrismaCustomerPointRepository,
    },
  ],
  exports: [CUSTOMER_POINT_REPOSITORY],
})
export class CustomerPointModule {}
