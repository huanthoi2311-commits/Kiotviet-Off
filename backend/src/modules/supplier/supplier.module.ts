import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupplierExcelService } from './application/supplier-excel.service';
import { SupplierProductService } from './application/supplier-product.service';
import { SupplierService } from './application/supplier.service';
import { SUPPLIER_PRODUCT_REPOSITORY } from './domain/repositories/supplier-product.repository.interface';
import { SUPPLIER_REPOSITORY } from './domain/repositories/supplier.repository.interface';
import { SUPPLIER_EXCEL_PORT } from './domain/services/supplier-excel.interface';
import { ExceljsSupplierExcelAdapter } from './infrastructure/excel/exceljs-supplier-excel.adapter';
import { PrismaSupplierProductRepository } from './infrastructure/persistence/prisma-supplier-product.repository';
import { PrismaSupplierRepository } from './infrastructure/persistence/prisma-supplier.repository';
import { SupplierProductController } from './presentation/supplier-product.controller';
import { SupplierController } from './presentation/supplier.controller';

@Module({
  imports: [RbacModule],
  controllers: [SupplierController, SupplierProductController],
  providers: [
    SupplierService,
    SupplierProductService,
    SupplierExcelService,
    { provide: SUPPLIER_REPOSITORY, useClass: PrismaSupplierRepository },
    {
      provide: SUPPLIER_PRODUCT_REPOSITORY,
      useClass: PrismaSupplierProductRepository,
    },
    { provide: SUPPLIER_EXCEL_PORT, useClass: ExceljsSupplierExcelAdapter },
  ],
  exports: [SUPPLIER_REPOSITORY, SUPPLIER_PRODUCT_REPOSITORY],
})
export class SupplierModule {}
