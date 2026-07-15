import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class UpdateCartItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({
    example: 2,
    description:
      'Số lượng mới của dòng (giá trị tuyệt đối, không cộng dồn — dùng /cart/add để cộng dồn)',
  })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity: number;
}
