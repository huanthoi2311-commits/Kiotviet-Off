import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class UpsertSupplierProductDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  supplierSku?: string;

  @ApiProperty({
    required: false,
    default: 0,
    description: 'Số nhỏ hơn = ưu tiên hơn',
  })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultPrice?: number;

  @ApiProperty({ required: false, description: 'Số ngày giao hàng dự kiến' })
  @IsOptional()
  @IsInt()
  @Min(0)
  leadTime?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumOrderQuantity?: number;
}
