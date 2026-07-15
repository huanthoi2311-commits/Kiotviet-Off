import {
  InvoiceEntity,
  InvoiceItemEntity,
} from '../../domain/entities/invoice.entity';
import {
  InvoiceItemResponseDto,
  InvoiceResponseDto,
} from '../dto/invoice-response.dto';

export class InvoiceMapper {
  static toResponseDto(entity: InvoiceEntity): InvoiceResponseDto {
    return {
      id: entity.id,
      branchId: entity.branchId,
      orderId: entity.orderId,
      customerId: entity.customerId,
      code: entity.code,
      status: entity.status,
      totalAmount: entity.totalAmount,
      paidAmount: entity.paidAmount,
      dueAmount: entity.dueAmount,
      dueDate: entity.dueDate,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      items: entity.items.map((item) => InvoiceMapper.toItemResponseDto(item)),
    };
  }

  static toItemResponseDto(item: InvoiceItemEntity): InvoiceItemResponseDto {
    return {
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      taxAmount: item.taxAmount,
      totalAmount: item.totalAmount,
    };
  }
}
