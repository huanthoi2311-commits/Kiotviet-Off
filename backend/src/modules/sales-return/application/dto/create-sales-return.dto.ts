import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export const SALES_RETURN_REASONS = [
  'DAMAGED',
  'DEFECTIVE',
  'WRONG_PRODUCT',
  'CUSTOMER_CHANGED_MIND',
  'EXPIRED',
  'TRANSPORT_DAMAGE',
  'OTHER',
] as const;

export class CreateSalesReturnItemDto {
  @ApiProperty({ description: 'Id dòng hàng gốc trong Invoice' })
  @IsUUID()
  invoiceItemId: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiProperty({ enum: SALES_RETURN_REASONS })
  @IsEnum(SALES_RETURN_REASONS)
  reason: (typeof SALES_RETURN_REASONS)[number];

  @ApiProperty({
    required: false,
    description: 'Bắt buộc khi reason = OTHER (validate ở Application layer)',
  })
  @IsOptional()
  @IsString()
  reasonNote?: string;

  @ApiProperty({
    required: false,
    description:
      'Bắt buộc tại bước Receive nếu Product không phải SERVICE (validate ở Application layer, SPEC §5)',
  })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

export class CreateSalesReturnDto {
  @ApiProperty()
  @IsUUID()
  invoiceId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ type: [CreateSalesReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesReturnItemDto)
  items: CreateSalesReturnItemDto[];
}

export class UpdateSalesReturnDraftDto {
  @ApiProperty({ description: 'Optimistic Lock — version hiện tại của phiếu' })
  @IsNumber()
  version: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ required: false, type: [CreateSalesReturnItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesReturnItemDto)
  items?: CreateSalesReturnItemDto[];
}
