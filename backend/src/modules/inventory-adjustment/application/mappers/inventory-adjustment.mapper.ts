import { InventoryAdjustmentEntity } from '../../domain/entities/inventory-adjustment.entity';
import { InventoryAdjustmentResponseDto } from '../dto/inventory-adjustment-response.dto';

export class InventoryAdjustmentMapper {
  static toResponseDto(
    entity: InventoryAdjustmentEntity,
  ): InventoryAdjustmentResponseDto {
    return {
      id: entity.id,
      warehouseId: entity.warehouseId,
      code: entity.code,
      status: entity.status,
      reason: entity.reason,
      note: entity.note,
      items: entity.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        remark: item.remark,
      })),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
