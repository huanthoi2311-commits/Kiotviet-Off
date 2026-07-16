import { UnitEntity } from '../../domain/entities/unit.entity';
import { UnitResponseDto } from '../dto/unit-response.dto';

export class UnitMapper {
  static toResponseDto(entity: UnitEntity): UnitResponseDto {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      symbol: entity.symbol,
      status: entity.status,
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
