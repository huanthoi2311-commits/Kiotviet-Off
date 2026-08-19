import { Inject, Injectable } from '@nestjs/common';
import { WarehouseEntity } from '../domain/entities/warehouse.entity';
import { WAREHOUSE_REPOSITORY } from '../domain/repositories/warehouse.repository.interface';
import type { IWarehouseRepository } from '../domain/repositories/warehouse.repository.interface';

/**
 * T053.05C-2 — Cửa ngõ ĐỌC duy nhất của `Warehouse` cho module khác không thể import
 * `WarehouseModule` đầy đủ (ADR-0010 — Repository Boundary, cùng pattern `UserReferenceService`).
 * `WarehouseService.findOne()` hiện có làm đúng việc này nhưng không "leaf-safe" (WarehouseModule
 * đầy đủ import `BranchModule`) — service riêng này chỉ phụ thuộc `WarehousePersistenceModule`
 * (module lá), nên `BranchModule` import được mà không tạo vòng lặp Branch→Warehouse→Branch. Đúng
 * 1 phương thức mà `branch` module thực sự cần (YAGNI) — không có method ghi, không business logic.
 */
@Injectable()
export class WarehouseReferenceService {
  constructor(
    @Inject(WAREHOUSE_REPOSITORY)
    private readonly warehouseRepository: IWarehouseRepository,
  ) {}

  findById(
    id: string,
    organizationId: string,
  ): Promise<WarehouseEntity | null> {
    return this.warehouseRepository.findById(id, organizationId);
  }
}
