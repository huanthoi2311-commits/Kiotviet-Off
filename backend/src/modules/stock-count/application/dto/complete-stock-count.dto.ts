import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CompleteStockCountItemDto {
  @ApiProperty({
    description: 'id của StockCountItem (lấy từ GET /stock-count/:id)',
  })
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: 95, description: 'Số lượng đếm thực tế' })
  @IsNumber()
  @Min(0)
  actualQty: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class CompleteStockCountDto {
  @ApiProperty({ type: [CompleteStockCountItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CompleteStockCountItemDto)
  items: CompleteStockCountItemDto[];
}
