import { Inject, Injectable } from '@nestjs/common';
import { CategoryEntity } from '../domain/entities/category.entity';
import { CATEGORY_REPOSITORY } from '../domain/repositories/category.repository.interface';
import type { ICategoryRepository } from '../domain/repositories/category.repository.interface';

/**
 * T053.05C-2 — Cửa ngõ ĐỌC duy nhất của `Category` cho module khác (ADR-0010 — Repository Boundary,
 * cùng pattern `UserReferenceService`/`WarehouseReferenceService`). Đúng 1 phương thức mà `product`
 * module thực sự cần (YAGNI) — không có method ghi, không có business logic.
 */
@Injectable()
export class CategoryReferenceService {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: ICategoryRepository,
  ) {}

  findById(id: string, organizationId: string): Promise<CategoryEntity | null> {
    return this.categoryRepository.findById(id, organizationId);
  }
}
