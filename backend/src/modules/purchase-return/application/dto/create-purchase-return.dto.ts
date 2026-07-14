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

const PURCHASE_RETURN_REASONS = [
  'DAMAGED',
  'WRONG_PRODUCT',
  'EXPIRED',
  'OTHER',
] as const;

export class CreatePurchaseReturnItemDto {
  @ApiProperty({ description: 'Id dòng hàng gốc trong Purchase Order' })
  @IsUUID()
  purchaseItemId: string;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @IsPositive()
  quantity: number;
}

export class CreatePurchaseReturnDto {
  @ApiProperty()
  @IsUUID()
  purchaseOrderId: string;

  @ApiProperty({ enum: PURCHASE_RETURN_REASONS })
  @IsEnum(PURCHASE_RETURN_REASONS)
  reason: (typeof PURCHASE_RETURN_REASONS)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ type: [CreatePurchaseReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseReturnItemDto)
  items: CreatePurchaseReturnItemDto[];
}
