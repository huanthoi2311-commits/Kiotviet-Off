import { Module } from '@nestjs/common';
import { BARCODE_REPOSITORY } from './domain/repositories/barcode.repository.interface';
import { PrismaBarcodeRepository } from './infrastructure/persistence/prisma-barcode.repository';

/**
 * Hạ tầng thuần túy (Decision RPC01) — registration owner DUY NHẤT của `BARCODE_REPOSITORY`.
 * Không chứa Controller/Application Service/Domain Service/business rule. Không import module
 * nghiệp vụ nào (không `ProductModule`, không `UnitModule`, không `BarcodeModule`/
 * `BarcodeReferenceModule`) — đây là điều kiện để tránh circular dependency giữa `barcode` và
 * `unit` (xem `ARCHITECT RESOLUTION — T009 Barcode Repository Ownership Correction`).
 *
 * Chỉ 2 module được phép import: `BarcodeModule` (cho `BarcodeService`) và `BarcodeReferenceModule`
 * (cho `BarcodeDomainService`) — Decision RPC07, xác nhận qua `barcode-repository-boundary.architecture.spec.ts`.
 */
@Module({
  providers: [
    { provide: BARCODE_REPOSITORY, useClass: PrismaBarcodeRepository },
  ],
  exports: [BARCODE_REPOSITORY],
})
export class BarcodePersistenceModule {}
