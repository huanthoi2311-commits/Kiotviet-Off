import {
  SupplierEntity,
  SupplierProductEntity,
} from '../../domain/entities/supplier.entity';
import { SupplierProductResponseDto } from '../dto/supplier-product-response.dto';
import { SupplierResponseDto } from '../dto/supplier-response.dto';

export class SupplierMapper {
  static toResponseDto(entity: SupplierEntity): SupplierResponseDto {
    return {
      id: entity.id,
      code: entity.code,
      taxCode: entity.taxCode,
      companyName: entity.companyName,
      contactName: entity.contactName,
      phone: entity.phone,
      email: entity.email,
      website: entity.website,
      address: entity.address,
      province: entity.province,
      district: entity.district,
      ward: entity.ward,
      bankName: entity.bankName,
      bankAccount: entity.bankAccount,
      paymentTerm: entity.paymentTerm,
      creditLimit: entity.creditLimit,
      status: entity.status,
      version: entity.version,
      note: entity.note,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }

  static toSupplierProductResponseDto(
    entity: SupplierProductEntity,
  ): SupplierProductResponseDto {
    return {
      id: entity.id,
      supplierId: entity.supplierId,
      productId: entity.productId,
      supplierSku: entity.supplierSku,
      priority: entity.priority,
      defaultPrice: entity.defaultPrice,
      leadTime: entity.leadTime,
      minimumOrderQuantity: entity.minimumOrderQuantity,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
