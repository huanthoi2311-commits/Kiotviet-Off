import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class AddCartItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({
    example: 1,
    description:
      'Số lượng thêm vào giỏ — cộng dồn nếu sản phẩm đã có sẵn trong giỏ',
  })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity: number;
}
