import { PurchaseOrderEntity } from '../../domain/entities/purchase-order.entity';
import { PurchaseOrderResponseDto } from '../dto/purchase-order-response.dto';

export class PurchaseOrderMapper {
  static toResponseDto(entity: PurchaseOrderEntity): PurchaseOrderResponseDto {
    return {
      id: entity.id,
      branchId: entity.branchId,
      supplierId: entity.supplierId,
      code: entity.code,
      status: entity.status,
      totalAmount: entity.totalAmount,
      paidAmount: entity.paidAmount,
      expectedAt: entity.expectedAt,
      items: entity.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantity: item.quantity,
        receivedQuantity: item.receivedQuantity,
        unitCost: item.unitCost,
        discount: item.discount,
        taxAmount: item.taxAmount,
        totalAmount: item.totalAmount,
      })),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
