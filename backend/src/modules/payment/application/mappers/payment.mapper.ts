import { PaymentEntity } from '../../domain/entities/payment.entity';
import { PaymentResponseDto } from '../dto/payment-response.dto';

export class PaymentMapper {
  static toResponseDto(entity: PaymentEntity): PaymentResponseDto {
    return {
      id: entity.id,
      branchId: entity.branchId,
      invoiceId: entity.invoiceId,
      customerId: entity.customerId,
      method: entity.method,
      amount: entity.amount,
      paidAt: entity.paidAt,
      createdAt: entity.createdAt,
    };
  }
}
