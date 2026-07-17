import { BarcodeEntity } from '../../domain/entities/barcode.entity';
import { BarcodeResponseDto } from '../dto/barcode-response.dto';

export class BarcodeMapper {
  static toResponseDto(entity: BarcodeEntity): BarcodeResponseDto {
    return {
      id: entity.id,
      productId: entity.productId,
      unitId: entity.unitId,
      code: entity.code,
      type: entity.type,
      isDefault: entity.isDefault,
      status: entity.status,
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
