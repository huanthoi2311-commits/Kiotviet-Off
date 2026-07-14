import { StockCountEntity } from '../../domain/entities/stock-count.entity';
import { StockCountResponseDto } from '../dto/stock-count-response.dto';

export class StockCountMapper {
  static toResponseDto(entity: StockCountEntity): StockCountResponseDto {
    return {
      id: entity.id,
      warehouseId: entity.warehouseId,
      code: entity.code,
      status: entity.status,
      note: entity.note,
      items: entity.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        systemQty: item.systemQty,
        actualQty: item.actualQty,
        difference: item.difference,
        remark: item.remark,
      })),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
