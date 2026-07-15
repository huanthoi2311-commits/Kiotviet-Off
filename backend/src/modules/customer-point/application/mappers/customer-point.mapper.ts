import { CustomerPointLedgerEntity } from '../../domain/entities/customer-point-ledger.entity';
import { CustomerPointLedgerResponseDto } from '../dto/customer-point-response.dto';

export class CustomerPointMapper {
  static toResponseDto(
    entity: CustomerPointLedgerEntity,
  ): CustomerPointLedgerResponseDto {
    return {
      id: entity.id,
      customerId: entity.customerId,
      referenceType: entity.referenceType,
      referenceId: entity.referenceId,
      point: entity.point,
      balance: entity.balance,
      expiredAt: entity.expiredAt,
      createdAt: entity.createdAt,
    };
  }
}
