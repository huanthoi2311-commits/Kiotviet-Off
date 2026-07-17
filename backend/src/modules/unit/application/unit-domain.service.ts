import { Inject, Injectable } from '@nestjs/common';
import { UnitEntity } from '../domain/entities/unit.entity';
import { UNIT_REPOSITORY } from '../domain/repositories/unit.repository.interface';
import type { IUnitRepository } from '../domain/repositories/unit.repository.interface';

/**
 * Cửa ngõ ĐỌC duy nhất của `Unit` cho module khác (SPEC-BARCODE-001 §9.4, Decision BQ11/CD05,
 * ADR-0010 — Repository Boundary). Đúng mẫu `ProductDomainService`/`BarcodeDomainService` — đúng
 * 1 method mà `barcode` module thực sự cần (YAGNI). Đây là consumer thật sự thứ 2 của Unit sau
 * chính `unit.service.ts` — kết thúc giai đoạn YAGNI đã áp dụng từ T006-T008 (Decision
 * U08/RQ6/SU06/UP02).
 */
@Injectable()
export class UnitDomainService {
  constructor(
    @Inject(UNIT_REPOSITORY)
    private readonly unitRepository: IUnitRepository,
  ) {}

  findByIdForReference(
    organizationId: string,
    unitId: string,
  ): Promise<UnitEntity | null> {
    return this.unitRepository.findById(unitId, organizationId);
  }
}
