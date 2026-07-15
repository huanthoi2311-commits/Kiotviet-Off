import { ApiProperty } from '@nestjs/swagger';

export class CartItemResponseDto {
  @ApiProperty() productId: string;
  @ApiProperty() productName: string;
  @ApiProperty() quantity: string;
  @ApiProperty() price: string;
  @ApiProperty() discount: string;
  @ApiProperty() promotion: string;
  @ApiProperty() voucher: string;
  @ApiProperty() tax: string;
  @ApiProperty() total: string;
}

export class CartResponseDto {
  @ApiProperty({ type: [CartItemResponseDto] }) items: CartItemResponseDto[];
  @ApiProperty() subtotal: string;
  @ApiProperty() totalDiscount: string;
  @ApiProperty() totalPromotion: string;
  @ApiProperty() totalVoucher: string;
  @ApiProperty() totalTax: string;
  @ApiProperty() totalAmount: string;
  @ApiProperty() updatedAt: string;
}
