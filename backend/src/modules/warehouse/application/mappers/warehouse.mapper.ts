import { WarehouseEntity } from '../../domain/entities/warehouse.entity';
import { WarehouseResponseDto } from '../dto/warehouse-response.dto';

export class WarehouseMapper {
  static toResponseDto(entity: WarehouseEntity): WarehouseResponseDto {
    return {
      id: entity.id,
      branchId: entity.branchId,
      managerId: entity.managerId,
      code: entity.code,
      name: entity.name,
      type: entity.type,
      address: entity.address,
      phone: entity.phone,
      email: entity.email,
      description: entity.description,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
