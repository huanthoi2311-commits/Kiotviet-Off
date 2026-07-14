import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateStockCountDto {
  @ApiProperty({ description: 'Kho cần kiểm kê' })
  @IsUUID()
  warehouseId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({
    type: [String],
    description:
      'Danh sách sản phẩm cần kiểm kê — hệ thống tự chụp tồn kho hiện tại làm System Qty',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  productIds: string[];
}
