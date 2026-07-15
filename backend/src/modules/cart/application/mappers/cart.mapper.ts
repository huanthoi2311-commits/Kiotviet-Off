import { CartEntity, CartItemEntity } from '../../domain/entities/cart.entity';
import { CartItemResponseDto, CartResponseDto } from '../dto/cart-response.dto';

export class CartMapper {
  static toResponseDto(entity: CartEntity): CartResponseDto {
    return {
      items: entity.items.map((item) => CartMapper.toItemResponseDto(item)),
      subtotal: entity.subtotal,
      totalDiscount: entity.totalDiscount,
      totalPromotion: entity.totalPromotion,
      totalVoucher: entity.totalVoucher,
      totalTax: entity.totalTax,
      totalAmount: entity.totalAmount,
      updatedAt: entity.updatedAt,
    };
  }

  static toItemResponseDto(item: CartItemEntity): CartItemResponseDto {
    return {
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      price: item.price,
      discount: item.discount,
      promotion: item.promotion,
      voucher: item.voucher,
      tax: item.tax,
      total: item.total,
    };
  }
}
