import { TransferEntity } from '../../domain/entities/transfer.entity';
import { TransferResponseDto } from '../dto/transfer-response.dto';

export class TransferMapper {
  static toResponseDto(entity: TransferEntity): TransferResponseDto {
    return {
      id: entity.id,
      fromWarehouseId: entity.fromWarehouseId,
      toWarehouseId: entity.toWarehouseId,
      code: entity.code,
      status: entity.status,
      note: entity.note,
      items: entity.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        unitCost: item.unitCost,
      })),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
