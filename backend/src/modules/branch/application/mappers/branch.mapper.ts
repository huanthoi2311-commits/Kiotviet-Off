import { BranchEntity } from '../../domain/entities/branch.entity';
import { BranchResponseDto } from '../dto/branch-response.dto';

export class BranchMapper {
  static toResponseDto(entity: BranchEntity): BranchResponseDto {
    return {
      id: entity.id,
      managerUserId: entity.managerUserId,
      defaultWarehouseId: entity.defaultWarehouseId,
      code: entity.code,
      name: entity.name,
      email: entity.email,
      address: entity.address,
      province: entity.province,
      district: entity.district,
      ward: entity.ward,
      phone: entity.phone,
      invoicePrefix: entity.invoicePrefix,
      receiptPrefix: entity.receiptPrefix,
      timezone: entity.timezone,
      currencyCode: entity.currencyCode,
      isMain: entity.isMain,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
