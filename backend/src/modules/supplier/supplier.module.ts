import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupplierDomainService } from './application/supplier-domain.service';
import { SupplierExcelService } from './application/supplier-excel.service';
import { SupplierProductService } from './application/supplier-product.service';
import { SupplierService } from './application/supplier.service';
import { SUPPLIER_PRODUCT_REPOSITORY } from './domain/repositories/supplier-product.repository.interface';
import { SUPPLIER_REPOSITORY } from './domain/repositories/supplier.repository.interface';
import { SUPPLIER_CODE_GENERATOR } from './domain/services/supplier-code-generator.interface';
import { SUPPLIER_EXCEL_PORT } from './domain/services/supplier-excel.interface';
import { ExceljsSupplierExcelAdapter } from './infrastructure/excel/exceljs-supplier-excel.adapter';
import { SequenceSupplierCodeGenerator } from './infrastructure/generators/sequence-supplier-code.generator';
import { PrismaSupplierProductRepository } from './infrastructure/persistence/prisma-supplier-product.repository';
import { PrismaSupplierRepository } from './infrastructure/persistence/prisma-supplier.repository';
import { SupplierProductController } from './presentation/supplier-product.controller';
import { SupplierController } from './presentation/supplier.controller';

/**
 * T012 (Decision SR05/SR06, ADR-0010 — Repository Boundary) — `SUPPLIER_REPOSITORY` VÀ
 * `SUPPLIER_PRODUCT_REPOSITORY` KHÔNG còn export. `supplier-debt` phải phụ thuộc
 * `SupplierDomainService` (public application port), không phụ thuộc repository token trực tiếp.
 */
@Module({
  imports: [RbacModule],
  controllers: [SupplierController, SupplierProductController],
  providers: [
    SupplierService,
    SupplierDomainService,
    SupplierProductService,
    SupplierExcelService,
    { provide: SUPPLIER_REPOSITORY, useClass: PrismaSupplierRepository },
    {
      provide: SUPPLIER_PRODUCT_REPOSITORY,
      useClass: PrismaSupplierProductRepository,
    },
    { provide: SUPPLIER_EXCEL_PORT, useClass: ExceljsSupplierExcelAdapter },
    {
      provide: SUPPLIER_CODE_GENERATOR,
      useClass: SequenceSupplierCodeGenerator,
    },
  ],
  exports: [SupplierDomainService],
})
export class SupplierModule {}
