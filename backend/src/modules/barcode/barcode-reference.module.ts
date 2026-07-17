import { Module } from '@nestjs/common';
import { BarcodePersistenceModule } from './barcode-persistence.module';
import { BarcodeDomainService } from './application/barcode-domain.service';

/**
 * Read-only reference capability cho module khác (Decision RPC03, ADR-0010). Chỉ export
 * `BarcodeDomainService` — không export `BARCODE_REPOSITORY`, không chứa `BarcodeService`/write
 * use case/Controller nào. Import `BarcodePersistenceModule` để `BarcodeDomainService` có
 * `BARCODE_REPOSITORY` — KHÔNG import `UnitModule`/`ProductModule` (điều kiện tránh circular
 * dependency — xem `ARCHITECT RESOLUTION — T009 Circular Module Dependency`, Decision CD07 đã
 * xác nhận `BarcodeDomainService` không cần `ProductModule`).
 */
@Module({
  imports: [BarcodePersistenceModule],
  providers: [BarcodeDomainService],
  exports: [BarcodeDomainService],
})
export class BarcodeReferenceModule {}
