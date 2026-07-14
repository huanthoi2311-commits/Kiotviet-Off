import { PurchaseReturnEntity } from '../../domain/entities/purchase-return.entity';
import { PurchaseReturnResponseDto } from '../dto/purchase-return-response.dto';

export class PurchaseReturnMapper {
  static toResponseDto(
    entity: PurchaseReturnEntity,
  ): PurchaseReturnResponseDto {
    return {
      id: entity.id,
      purchaseOrderId: entity.purchaseOrderId,
      supplierId: entity.supplierId,
      code: entity.code,
      status: entity.status,
      reason: entity.reason,
      totalAmount: entity.totalAmount,
      note: entity.note,
      items: entity.items.map((item) => ({
        id: item.id,
        purchaseItemId: item.purchaseItemId,
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantity: item.quantity,
        unitCost: item.unitCost,
        totalAmount: item.totalAmount,
      })),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
