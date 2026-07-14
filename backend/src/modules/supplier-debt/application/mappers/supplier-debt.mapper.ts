import {
  SupplierDebtEntity,
  SupplierPaymentEntity,
} from '../../domain/entities/supplier-debt.entity';
import { SupplierDebtResponseDto } from '../dto/supplier-debt-response.dto';
import { SupplierPaymentResponseDto } from '../dto/supplier-payment-response.dto';

export class SupplierDebtMapper {
  static toDebtResponseDto(
    entity: SupplierDebtEntity,
  ): SupplierDebtResponseDto {
    return {
      supplierId: entity.supplierId,
      supplierCode: entity.supplierCode,
      supplierName: entity.supplierName,
      totalDebt: entity.totalDebt,
      totalPaid: entity.totalPaid,
      balance: entity.balance,
    };
  }

  static toPaymentResponseDto(
    entity: SupplierPaymentEntity,
  ): SupplierPaymentResponseDto {
    return {
      id: entity.id,
      branchId: entity.branchId,
      supplierId: entity.supplierId,
      purchaseOrderId: entity.purchaseOrderId,
      method: entity.method,
      amount: entity.amount,
      paidAt: entity.paidAt,
      createdAt: entity.createdAt,
    };
  }
}
