import { Module } from '@nestjs/common';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { UnitService } from './application/unit.service';
import { UNIT_REPOSITORY } from './domain/repositories/unit.repository.interface';
import { PrismaUnitRepository } from './infrastructure/persistence/prisma-unit.repository';
import { UnitController } from './presentation/unit.controller';

@Module({
  imports: [RbacModule, ProductModule],
  controllers: [UnitController],
  providers: [
    UnitService,
    { provide: UNIT_REPOSITORY, useClass: PrismaUnitRepository },
  ],
  exports: [UNIT_REPOSITORY],
})
export class UnitModule {}
