import { CustomerEntity } from '../../domain/entities/customer.entity';
import { CustomerResponseDto } from '../dto/customer-response.dto';

export class CustomerMapper {
  static toResponseDto(entity: CustomerEntity): CustomerResponseDto {
    return {
      id: entity.id,
      code: entity.code,
      customerType: entity.customerType,
      fullName: entity.fullName,
      phone: entity.phone,
      email: entity.email,
      birthday: entity.birthday,
      gender: entity.gender,
      taxCode: entity.taxCode,
      companyName: entity.companyName,
      contactName: entity.contactName,
      address: entity.address,
      province: entity.province,
      district: entity.district,
      ward: entity.ward,
      avatar: entity.avatar,
      note: entity.note,
      creditLimit: entity.creditLimit,
      paymentTermDays: entity.paymentTermDays,
      currentDebt: entity.currentDebt,
      totalRevenue: entity.totalRevenue,
      totalOrder: entity.totalOrder,
      totalPoint: entity.totalPoint,
      status: entity.status,
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
