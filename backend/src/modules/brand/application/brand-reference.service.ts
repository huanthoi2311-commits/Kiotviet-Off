import { Inject, Injectable } from '@nestjs/common';
import { BrandEntity } from '../domain/entities/brand.entity';
import { BRAND_REPOSITORY } from '../domain/repositories/brand.repository.interface';
import type { IBrandRepository } from '../domain/repositories/brand.repository.interface';

/**
 * T053.05C-2 — Cửa ngõ ĐỌC duy nhất của `Brand` cho module khác (ADR-0010 — Repository Boundary,
 * cùng pattern `CategoryReferenceService`). Đúng 1 phương thức mà `product` module thực sự cần
 * (YAGNI) — không có method ghi, không có business logic.
 */
@Injectable()
export class BrandReferenceService {
  constructor(
    @Inject(BRAND_REPOSITORY)
    private readonly brandRepository: IBrandRepository,
  ) {}

  findById(id: string, organizationId: string): Promise<BrandEntity | null> {
    return this.brandRepository.findById(id, organizationId);
  }
}
