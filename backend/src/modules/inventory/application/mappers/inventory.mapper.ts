import {
  InventoryEntity,
  InventoryMovementEntity,
} from '../../domain/entities/inventory.entity';
import { InventoryResponseDto } from '../dto/inventory-response.dto';
import { InventoryMovementResponseDto } from '../dto/movement-response.dto';

export class InventoryMapper {
  static toResponseDto(entity: InventoryEntity): InventoryResponseDto {
    return {
      id: entity.id,
      warehouseId: entity.warehouseId,
      productId: entity.productId,
      quantity: entity.quantity,
      reservedQty: entity.reservedQty,
      availableQty: entity.availableQty,
      avgCost: entity.avgCost,
      lastCost: entity.lastCost,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  static toMovementResponseDto(
    entity: InventoryMovementEntity,
  ): InventoryMovementResponseDto {
    return {
      id: entity.id,
      warehouseId: entity.warehouseId,
      productId: entity.productId,
      movementType: entity.movementType,
      referenceType: entity.referenceType,
      referenceId: entity.referenceId,
      quantity: entity.quantity,
      beforeQuantity: entity.beforeQuantity,
      afterQuantity: entity.afterQuantity,
      unitCost: entity.unitCost,
      remark: entity.remark,
      createdAt: entity.createdAt,
    };
  }
}
