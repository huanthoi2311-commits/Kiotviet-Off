import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export const SALES_RETURN_REFUND_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'CARD',
  'E_WALLET',
] as const;

export class CreateSalesReturnRefundDto {
  @ApiProperty({ example: 100000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: SALES_RETURN_REFUND_METHODS })
  @IsEnum(SALES_RETURN_REFUND_METHODS)
  method: (typeof SALES_RETURN_REFUND_METHODS)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  externalReference?: string;
}
