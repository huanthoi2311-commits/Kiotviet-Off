import { Module } from '@nestjs/common';
import { CustomerModule } from '../customer/customer.module';
import { RbacModule } from '../rbac/rbac.module';
import { CustomerPointDomainService } from './application/customer-point-domain.service';
import { CustomerPointService } from './application/customer-point.service';
import { CUSTOMER_POINT_REPOSITORY } from './domain/repositories/customer-point.repository.interface';
import { PrismaCustomerPointRepository } from './infrastructure/persistence/prisma-customer-point.repository';
import { CustomerPointController } from './presentation/customer-point.controller';

/**
 * T013 Phase 2 (SPEC-T013-SALES-FOUNDATION-001 §9.2, ADR-0010 — Repository Boundary) —
 * `CUSTOMER_POINT_REPOSITORY` KHÔNG còn export. `checkout` phải phụ thuộc
 * `CustomerPointDomainService` (public application port), không phụ thuộc repository token trực tiếp.
 */
@Module({
  imports: [RbacModule, CustomerModule],
  controllers: [CustomerPointController],
  providers: [
    CustomerPointService,
    CustomerPointDomainService,
    {
      provide: CUSTOMER_POINT_REPOSITORY,
      useClass: PrismaCustomerPointRepository,
    },
  ],
  exports: [CustomerPointDomainService],
})
export class CustomerPointModule {}
