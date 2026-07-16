import { Inject, Injectable } from '@nestjs/common';
import { BARCODE_REPOSITORY } from '../domain/repositories/barcode.repository.interface';
import type { IBarcodeRepository } from '../domain/repositories/barcode.repository.interface';

/**
 * Cửa ngõ ĐỌC duy nhất của `Barcode` cho module khác (SPEC-UNIT-001 §8, Decision RQ5/SU05,
 * ADR-0010 — Repository Boundary). Đúng mẫu `ProductDomainService` — đúng 1 method mà `unit`
 * module thực sự cần (YAGNI, không thêm `create`/`update`/`archive` "phòng khi cần sau").
 */
@Injectable()
export class BarcodeDomainService {
  constructor(
    @Inject(BARCODE_REPOSITORY)
    private readonly barcodeRepository: IBarcodeRepository,
  ) {}

  hasActiveBarcodesInUnit(unitId: string): Promise<boolean> {
    return this.barcodeRepository.hasActiveBarcodesInUnit(unitId);
  }
}
