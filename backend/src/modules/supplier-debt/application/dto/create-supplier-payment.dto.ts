import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
} from 'class-validator';

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'E_WALLET'] as const;

export class CreateSupplierPaymentDto {
  @ApiProperty()
  @IsUUID()
  branchId: string;

  @ApiProperty()
  @IsUUID()
  supplierId: string;

  @ApiProperty({
    required: false,
    description: 'Đơn nhập hàng cụ thể được thanh toán (tùy chọn)',
  })
  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsEnum(PAYMENT_METHODS)
  method: (typeof PAYMENT_METHODS)[number];

  @ApiProperty({ example: 500000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ description: 'Thời điểm thanh toán' })
  @IsDateString()
  paidAt: string;
}
